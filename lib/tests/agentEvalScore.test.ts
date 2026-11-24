/**
 * Unit tests for agent observability pure helpers:
 * scoreCase, redact, cost estimate, eval portfolio seed math.
 * Does not call the live LLM.
 */

import { describe, it, expect } from 'vitest'
import { scoreCase, deriveConfirmMeta, toolRecordsFromStepResults } from '../agentObservability/score'
import {
  redactForStorage,
  redactSecrets,
  slimToolRecordForStorage,
  toolResultOk,
} from '../agentObservability/redact'
import { estimateCostUsd } from '../agentObservability/cost'
import { buildEvalPortfolioData } from '../agentEval/buildEvalPortfolio'
import { loadEvalFixtures } from '../agentEval/loadFixtures'
import { cashTotal } from '../portfolioAnalyst'
import type { AgentToolRecord, EvalExpect } from '../agentObservability/types'

describe('scoreCase', () => {
  const tools: AgentToolRecord[] = [
    {
      name: 'get_portfolio_summary',
      args: {},
      result: { totalMarketValue: 52000, totalCost: 41500 },
      ok: true,
    },
  ]

  it('passes toolsAnyOf when a required set is covered', () => {
    const rules: EvalExpect = {
      toolsAnyOf: [['get_portfolio_summary'], ['get_holdings']],
    }
    const r = scoreCase(rules, tools)
    expect(r.passed).toBe(true)
  })

  it('fails toolsAnyOf when none of the sets match', () => {
    const r = scoreCase(
      { toolsAnyOf: [['get_allocation'], ['simulate_scenario']] },
      tools
    )
    expect(r.passed).toBe(false)
  })

  it('fails on forbidden tools', () => {
    const r = scoreCase(
      { forbiddenTools: ['get_portfolio_summary'] },
      tools
    )
    expect(r.passed).toBe(false)
  })

  it('checks numeric oracle from tool results', () => {
    const r = scoreCase(
      {
        numericFromTools: [
          {
            tool: 'get_portfolio_summary',
            path: 'totalMarketValue',
            equals: 52000,
            tolerance: 0.01,
          },
        ],
      },
      tools
    )
    expect(r.passed).toBe(true)
  })

  it('fails numeric oracle on mismatch', () => {
    const r = scoreCase(
      {
        numericFromTools: [
          { path: 'totalMarketValue', equals: 99999, tolerance: 0.01 },
        ],
      },
      tools
    )
    expect(r.passed).toBe(false)
  })

  it('mustNotSucceedConfirm fails when confirm ok', () => {
    const withConfirm: AgentToolRecord[] = [
      ...tools,
      {
        name: 'confirm_transaction',
        args: { usePendingDraft: true },
        result: { ok: true },
        ok: true,
      },
    ]
    const r = scoreCase({ mustNotSucceedConfirm: true }, withConfirm)
    expect(r.passed).toBe(false)
  })

  it('mustNotCallConfirm fails when confirm called', () => {
    const withConfirm: AgentToolRecord[] = [
      {
        name: 'confirm_transaction',
        args: {},
        result: { ok: false, errors: ['blocked'] },
        ok: false,
      },
    ]
    const r = scoreCase({ mustNotCallConfirm: true }, withConfirm)
    expect(r.passed).toBe(false)
  })

  it('failureModeOnTool passes when mode matches', () => {
    const r = scoreCase(
      {
        failureModeOnTool: [
          { tool: 'confirm_transaction', failureMode: 'no_explicit_confirm' },
        ],
      },
      [
        {
          name: 'confirm_transaction',
          args: {},
          result: { ok: false, failureMode: 'no_explicit_confirm' },
          ok: false,
        },
      ]
    )
    expect(r.passed).toBe(true)
  })

  it('mustIncludeWarning requires warnings array', () => {
    const r = scoreCase(
      { mustIncludeWarning: true },
      [
        {
          name: 'prepare_transaction',
          args: {},
          result: { status: 'ready', warnings: ['oversell'] },
          ok: true,
        },
      ]
    )
    expect(r.passed).toBe(true)
  })

  it('mustIncludeWarning fails when warnings missing or empty', () => {
    expect(
      scoreCase({ mustIncludeWarning: true }, [
        {
          name: 'prepare_transaction',
          args: {},
          result: { status: 'ready' },
          ok: true,
        },
      ]).passed
    ).toBe(false)
    expect(
      scoreCase({ mustIncludeWarning: true }, [
        {
          name: 'prepare_transaction',
          args: {},
          result: { status: 'ready', warnings: [] },
          ok: true,
        },
      ]).passed
    ).toBe(false)
  })

  it('expectDryRun requires dryRun flag', () => {
    const r = scoreCase(
      { expectDryRun: true },
      [
        {
          name: 'prepare_transaction',
          args: {},
          result: { dryRun: true, wouldHave: 'prepare' },
          ok: true,
        },
      ]
    )
    expect(r.passed).toBe(true)
  })

  it('expectDryRun fails when dryRun is absent', () => {
    const r = scoreCase(
      { expectDryRun: true },
      [
        {
          name: 'prepare_transaction',
          args: {},
          result: { status: 'ready' },
          ok: true,
        },
      ]
    )
    expect(r.passed).toBe(false)
  })

  it('argsEquals requires the arg on the first matching call', () => {
    const called: AgentToolRecord[] = [
      {
        name: 'invoke_tax_agent',
        args: { sellFraction: 0.5, symbol: 'AAPL' },
        ok: true,
      },
    ]
    expect(
      scoreCase(
        {
          argsEquals: [
            { tool: 'invoke_tax_agent', path: 'sellFraction', equals: 0.5 },
          ],
        },
        called
      ).passed
    ).toBe(true)
    expect(
      scoreCase(
        {
          argsEquals: [
            { tool: 'invoke_tax_agent', path: 'sellFraction', equals: 1 },
          ],
        },
        called
      ).passed
    ).toBe(false)
    expect(
      scoreCase(
        {
          argsEquals: [
            { tool: 'invoke_news_agent', path: 'universe', equals: 'watchlist' },
          ],
        },
        called
      ).passed
    ).toBe(false)
  })

  it('argsNot fails only when the arg is present and equal', () => {
    const called: AgentToolRecord[] = [
      { name: 'invoke_news_agent', args: {}, ok: true },
    ]
    expect(
      scoreCase(
        {
          argsNot: [
            { tool: 'invoke_news_agent', path: 'forceRefresh', equals: true },
          ],
        },
        called
      ).passed
    ).toBe(true)
    expect(
      scoreCase(
        {
          argsNot: [
            { tool: 'invoke_news_agent', path: 'forceRefresh', equals: true },
          ],
        },
        [{ name: 'invoke_news_agent', args: { forceRefresh: true }, ok: true }]
      ).passed
    ).toBe(false)
  })

  it('failureModeOnTool fails on the wrong mode', () => {
    const r = scoreCase(
      {
        failureModeOnTool: [
          { tool: 'confirm_transaction', failureMode: 'no_explicit_confirm' },
        ],
      },
      [
        {
          name: 'confirm_transaction',
          args: {},
          result: { ok: false, failureMode: 'no_pending_draft' },
          ok: false,
        },
      ]
    )
    expect(r.passed).toBe(false)
  })
})

describe('deriveConfirmMeta', () => {
  it('detects blocked confirm', () => {
    const meta = deriveConfirmMeta([
      {
        name: 'confirm_transaction',
        args: {},
        ok: false,
        error: 'not confirmed',
      },
    ])
    expect(meta.had_confirm_attempt).toBe(true)
    expect(meta.confirm_blocked).toBe(true)
    expect(meta.confirm_success).toBe(false)
  })
})

describe('toolRecordsFromStepResults', () => {
  it('marks ok:false results as failed', () => {
    const recs = toolRecordsFromStepResults([
      {
        toolName: 'confirm_transaction',
        args: { usePendingDraft: true },
        result: { ok: false, errors: ['No pending draft'] },
      },
    ])
    expect(recs[0].ok).toBe(false)
    expect(recs[0].error).toContain('No pending draft')
  })
})

describe('redactForStorage', () => {
  it('truncates long strings and redacts notes', () => {
    const out = redactForStorage({
      notes: 'secret note',
      apiKey: 'secret-key',
      text: 'a'.repeat(600),
    }) as Record<string, unknown>
    expect(out.notes).toBe('[redacted]')
    expect(out.apiKey).toBe('[redacted]')
    expect(String(out.text).endsWith('…')).toBe(true)
    expect(String(out.text).length).toBeLessThan(510)
  })
})

describe('stored run text', () => {
  it('replaces key-shaped tokens and drops tool result bodies', () => {
    const text = 'use sk-livekeyvalue1234 and AKIAIOSFODNN7EXAMPLE now'
    expect(redactSecrets(text)).not.toContain('sk-live')
    expect(redactSecrets(text)).not.toContain('AKIA')
    expect(redactSecrets('a'.repeat(64))).toBe('a'.repeat(64))
    expect(redactSecrets('a1'.repeat(24))).toBe('[redacted]')
    const slim = slimToolRecordForStorage({
      name: 'get_holdings',
      ok: true,
      args: {
        symbol: 'AAPL',
        notes: 'secret',
        sourceText: 'a'.repeat(200),
      },
      result: { totalMarketValue: 52000 },
    })
    expect(slim.args).toEqual({ symbol: 'AAPL' })
    expect(slim).not.toHaveProperty('result')
  })
})

describe('toolResultOk', () => {
  it('detects error field', () => {
    expect(toolResultOk({ error: 'boom' }).ok).toBe(false)
  })
})

describe('estimateCostUsd', () => {
  it('returns null for empty usage', () => {
    expect(estimateCostUsd('grok-4.3', { promptTokens: 0, completionTokens: 0 })).toBeNull()
  })

  it('estimates positive cost', () => {
    const c = estimateCostUsd('grok-4.3', {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    })
    expect(c).toBeGreaterThan(0)
  })
})

describe('loadEvalFixtures', () => {
  it('keeps the analyst and orchestrator suites under the cap', () => {
    const analyst = loadEvalFixtures('portfolio_analyst')
    const orchestrator = loadEvalFixtures('portfolio_orchestrator')
    expect(analyst).toHaveLength(14)
    expect(orchestrator).toHaveLength(10)
    expect(analyst.every((f) => f.feature === 'portfolio_analyst')).toBe(true)
    expect(orchestrator.every((f) => f.feature === 'portfolio_orchestrator')).toBe(true)
  })

  it('refuse-future-log-001 allows an empty trace and a summary, and rejects a prepare', () => {
    const fixture = loadEvalFixtures('portfolio_analyst').find(
      (f) => f.id === 'refuse-future-log-001'
    )
    expect(fixture).toBeDefined()
    expect(scoreCase(fixture!.expect, []).passed).toBe(true)
    expect(
      scoreCase(fixture!.expect, [
        { name: 'get_portfolio_summary', args: {}, result: {}, ok: true },
      ]).passed
    ).toBe(true)
    expect(
      scoreCase(fixture!.expect, [
        { name: 'prepare_transaction', args: {}, result: {}, ok: false },
      ]).passed
    ).toBe(false)
  })
})

describe('buildEvalPortfolioData', () => {
  it('computes market value from seed prices', () => {
    const data = buildEvalPortfolioData({
      preferredCurrency: 'USD',
      transactions: [
        {
          symbol: 'AAPL',
          asset_type: 'stock',
          action: 'buy',
          quantity: 10,
          unit_price: 150,
          executed_at: '2025-01-15T12:00:00.000Z',
          currency: 'USD',
        },
        {
          symbol: 'BTC',
          asset_type: 'crypto',
          action: 'buy',
          quantity: 1,
          unit_price: 40000,
          executed_at: '2025-02-01T12:00:00.000Z',
          currency: 'USD',
        },
      ],
      prices: { AAPL: 200, BTC: 50000 },
    })
    expect(data.error).toBeNull()
    expect(data.totalMarketValue).toBe(52000)
    expect(data.openPerps).toEqual([])
  })

  it('adds open perp equity to the headline and leaves notional out', () => {
    const data = buildEvalPortfolioData({
      preferredCurrency: 'USD',
      transactions: [
        {
          symbol: 'Available Cash',
          asset_type: 'cash',
          action: 'inflow',
          quantity: 10000,
          unit_price: 1,
          executed_at: '2026-01-01T00:00:00.000Z',
          currency: 'USD',
        },
        {
          symbol: 'BTCUSDT',
          asset_type: 'future',
          action: 'buy',
          position_side: 'long',
          quantity: 0.2,
          unit_price: 100000,
          amount: 1000,
          executed_at: '2026-01-02T00:00:00.000Z',
          currency: 'USD',
        },
      ],
      prices: { BTCUSDT: 101000 },
    })
    expect(data.openPerps).toHaveLength(1)
    expect(data.openPerps[0].equity).toBe(1200)
    expect(data.openPerps[0].notional).toBe(20200)
    expect(cashTotal(data.enrichedHoldings)).toBe(9000)
    expect(data.totalMarketValue).toBe(10200)
    expect(data.totalMarketValue).not.toBe(9000 + 20200)
  })
})
