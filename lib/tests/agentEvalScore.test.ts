/**
 * Unit tests for agent observability pure helpers:
 * scoreCase, redact, cost estimate, eval portfolio seed math.
 * Does not call the live LLM.
 */

import { describe, it, expect } from 'vitest'
import { scoreCase, deriveConfirmMeta, toolRecordsFromStepResults } from '../agentObservability/score'
import { redactForStorage, toolResultOk } from '../agentObservability/redact'
import { estimateCostUsd } from '../agentObservability/cost'
import { buildEvalPortfolioData } from '../agentEval/buildEvalPortfolio'
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
      text: 'a'.repeat(600),
    }) as Record<string, unknown>
    expect(out.notes).toBe('[redacted]')
    expect(String(out.text).endsWith('…')).toBe(true)
    expect(String(out.text).length).toBeLessThan(510)
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
  })
})
