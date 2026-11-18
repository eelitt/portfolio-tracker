import { describe, it, expect } from 'vitest'
import { formatUserContextForPrompt } from '@/lib/aiTools/formatUserContext'
import type { UserContextPack } from '@/lib/aiTools/types'
import {
  buildOrchestratorRoute,
  clipOrchestratorUserText,
  ORCHESTRATOR_USER_TEXT_MAX,
} from '@/lib/agentObservability/routeMeta'
import type { AgentToolRecord } from '@/lib/agentObservability'

const pack: UserContextPack = {
  preferredCurrency: 'EUR',
  isAdmin: false,
  goals: [
    {
      name: 'House',
      targetAmount: 50000,
      isCompleted: false,
      targetDate: null,
      plannedMonthly: 200,
    },
  ],
  lastAnalysis: {
    bullets: ['Concentrated in one stock worth 12345'],
    asOf: '2026-01-01T00:00:00.000Z',
  },
  lastNews: { asOf: '2026-01-02T00:00:00.000Z', symbolCount: 2 },
  investorOneLiner: '30–39, long, moderate',
  targetOneLiner: 'Target: stock 60 / etf 40',
}

describe('formatUserContextForPrompt', () => {
  it('routes without a market-value figure', () => {
    const text = formatUserContextForPrompt(pack)
    expect(text).toContain('Preferred currency: **EUR**')
    expect(text).toContain('House')
    expect(text).toContain('Concentrated in one stock worth 12345')
    expect(text).not.toMatch(/Portfolio snapshot/i)
    expect(text).not.toMatch(/\bMV\b/)
    expect(text).not.toMatch(/holdings/i)
    expect(text).not.toContain('~')
  })
})

describe('buildOrchestratorRoute', () => {
  it('keeps invoke order and routing args, drops specialist prose', () => {
    const tools: AgentToolRecord[] = [
      {
        name: 'invoke_news_agent',
        ok: true,
        args: {
          universe: 'watchlist',
          forceRefresh: false,
          questionHint: 'should not be copied',
        },
        result: { brief: 'Secret headline about BTC at 99999' },
      },
      {
        name: 'invoke_portfolio_analyst',
        ok: false,
        args: {
          task: 'answer',
          symbols: ['AAPL', 'BTC'],
          userMessage: 'the real sentence stays off this list',
          newsContext: { brief: 'do not copy' },
        },
        result: { text: 'You hold 3.5 BTC worth a lot' },
      },
      {
        name: 'get_portfolio_summary',
        ok: true,
        args: {},
        result: { totalMarketValue: 10 },
      },
    ]

    const route = buildOrchestratorRoute(tools)
    expect(route.map((s) => s.name)).toEqual([
      'invoke_news_agent',
      'invoke_portfolio_analyst',
    ])
    expect(route[0]).toEqual({
      name: 'invoke_news_agent',
      ok: true,
      universe: 'watchlist',
      forceRefresh: false,
    })
    expect(route[1]).toEqual({
      name: 'invoke_portfolio_analyst',
      ok: false,
      task: 'answer',
      symbols: ['AAPL', 'BTC'],
    })
    const dumped = JSON.stringify(route)
    expect(dumped).not.toContain('Secret headline')
    expect(dumped).not.toContain('99999')
    expect(dumped).not.toContain('userMessage')
    expect(dumped).not.toContain('3.5 BTC')
  })

  it('clips the stored question to 500 characters', () => {
    const clipped = clipOrchestratorUserText(`  ${'a'.repeat(800)}  `)
    expect(clipped.length).toBe(ORCHESTRATOR_USER_TEXT_MAX)
  })
})
