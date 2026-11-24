import { describe, expect, it } from 'vitest'
import {
  attachToolCatalog,
  coveredToolIds,
  overviewWindowDays,
  summarizeOverview,
  type OverviewSourceRow,
  type OverviewToolCatalogEntry,
} from '@/lib/agentObservability/overviewRows'

function row(partial: Partial<OverviewSourceRow> & Pick<OverviewSourceRow, 'status'>): OverviewSourceRow {
  return {
    created_at: '2026-11-01T00:00:00.000Z',
    duration_ms: null,
    estimated_cost_usd: null,
    total_tokens: null,
    tools: null,
    meta: null,
    ...partial,
  }
}

describe('overviewWindowDays', () => {
  it('maps the presets and treats an unknown value as 30 days', () => {
    expect(overviewWindowDays('week')).toBe(7)
    expect(overviewWindowDays('month')).toBe(30)
    expect(overviewWindowDays('all')).toBeNull()
    expect(overviewWindowDays('90')).toBe(30)
  })
})

describe('summarizeOverview', () => {
  it('counts errors over every row and skips null averages', () => {
    const stats = summarizeOverview(
      [
        row({
          status: 'success',
          created_at: '2026-11-02T00:00:00.000Z',
          duration_ms: 100,
          estimated_cost_usd: '0.25',
          total_tokens: 10,
          meta: { had_confirm_attempt: true, confirm_success: true },
          tools: [{ name: 'prepare_transaction', args: {}, ok: true }],
        }),
        row({
          status: 'error',
          created_at: '2026-11-03T00:00:00.000Z',
          tools: [{ name: 'prepare_transaction', args: {}, ok: false }],
        }),
        row({ status: 'running', created_at: '2026-11-01T00:00:00.000Z' }),
      ],
      { windowDays: 30, capped: false }
    )
    expect(stats.totalRuns).toBe(3)
    expect(stats.errorRate).toBeCloseTo(1 / 3)
    expect(stats.successCount).toBe(1)
    expect(stats.errorCount).toBe(1)
    expect(stats.partialCount).toBe(0)
    expect(stats.runningCount).toBe(1)
    expect(stats.avgDurationMs).toBe(100)
    expect(stats.avgEstimatedCostUsd).toBe(0.25)
    expect(stats.totalEstimatedCostUsd).toBe(0.25)
    expect(stats.avgTotalTokens).toBe(10)
    expect(stats.confirmAttempts).toBe(1)
    expect(stats.confirmSuccess).toBe(1)
    expect(stats.confirmBlocked).toBe(0)
    expect(stats.capped).toBe(false)
    expect(stats.toolErrorCounts).toEqual([
      {
        name: 'prepare_transaction',
        errors: 1,
        total: 2,
        errorGroups: [],
        recent: [],
      },
    ])
  })

  it('keeps five newest calls and the five most common errors', () => {
    const calls = Array.from({ length: 6 }, (_, index) =>
      row({
        id: `run-${index}`,
        parent_run_id: index === 0 ? null : 'parent-1',
        feature: 'portfolio_analyst',
        status: 'error',
        created_at: `2026-11-${String(20 - index).padStart(2, '0')}T00:00:00.000Z`,
        tools: [
          {
            name: 'get_portfolio',
            args: { symbol: index === 0 ? 'AAPL' : 'MSFT' },
            ok: false,
            error: index === 5 ? 'rare miss' : 'stale quote',
            latency_ms: 40 + index,
          },
        ],
      })
    )
    calls.push(
      row({
        id: 'other',
        feature: 'portfolio_analyst',
        status: 'error',
        created_at: '2026-11-01T00:00:00.000Z',
        tools: [
          {
            name: 'get_portfolio',
            args: {},
            ok: false,
            error: 'second miss',
          },
        ],
      })
    )
    const distinct = ['a miss', 'b miss', 'c miss', 'd miss', 'e miss', 'f miss']
    const manyErrors = distinct.map((error, index) =>
      row({
        id: `err-${index}`,
        feature: 'portfolio_analyst',
        status: 'error',
        created_at: '2026-11-01T00:00:00.000Z',
        tools: [{ name: 'lookup', args: { n: index }, ok: false, error }],
      })
    )
    const stats = summarizeOverview([...calls, ...manyErrors], {
      windowDays: 7,
      capped: false,
    })
    const portfolio = stats.toolErrorCounts.find((tool) => tool.name === 'get_portfolio')
    expect(portfolio?.errors).toBe(7)
    expect(portfolio?.total).toBe(7)
    expect(portfolio?.recent.map((sample) => sample.runId)).toEqual([
      'run-0',
      'run-1',
      'run-2',
      'run-3',
      'run-4',
    ])
    expect(portfolio?.recent[0]).toMatchObject({
      parentRunId: null,
      feature: 'portfolio_analyst',
      ok: false,
      latencyMs: 40,
      error: 'stale quote',
      args: { symbol: 'AAPL' },
    })
    expect(portfolio?.errorGroups).toEqual([
      { error: 'stale quote', count: 5 },
      { error: 'rare miss', count: 1 },
      { error: 'second miss', count: 1 },
    ])
    const lookup = stats.toolErrorCounts.find((tool) => tool.name === 'lookup')
    expect(lookup?.errorGroups).toHaveLength(5)
    expect(lookup?.errorGroups.map((group) => group.error)).toEqual([
      'a miss',
      'b miss',
      'c miss',
      'd miss',
      'e miss',
    ])
  })

  it('sums stored cost and leaves the total empty when every cost is null', () => {
    const summed = summarizeOverview(
      [
        row({ status: 'success', estimated_cost_usd: '0.25' }),
        row({ status: 'success', estimated_cost_usd: null }),
        row({ status: 'error', estimated_cost_usd: 0.5 }),
      ],
      { windowDays: null, capped: true }
    )
    expect(summed.totalEstimatedCostUsd).toBeCloseTo(0.75)
    expect(summed.avgEstimatedCostUsd).toBeCloseTo(0.375)
    expect(summed.windowDays).toBeNull()
    expect(summed.capped).toBe(true)

    const emptyCost = summarizeOverview(
      [row({ status: 'success' })],
      { windowDays: 7, capped: false }
    )
    expect(emptyCost.totalEstimatedCostUsd).toBeNull()
    expect(emptyCost.avgEstimatedCostUsd).toBeNull()
  })

  it('returns empty averages when there are no rows', () => {
    const stats = summarizeOverview([], { windowDays: 30, capped: false })
    expect(stats.errorRate).toBe(0)
    expect(stats.avgDurationMs).toBeNull()
    expect(stats.avgEstimatedCostUsd).toBeNull()
    expect(stats.totalEstimatedCostUsd).toBeNull()
    expect(stats.runningCount).toBe(0)
    expect(stats.capped).toBe(false)
  })
})

const catalog: OverviewToolCatalogEntry[] = [
  {
    id: 'get_holdings',
    owner: 'portfolio_analyst',
    label: 'Holdings',
    sideEffect: 'read',
    requiresConfirmation: false,
  },
  {
    id: 'invoke_news_agent',
    owner: 'orchestrator',
    label: 'News agent',
    sideEffect: 'external',
    requiresConfirmation: false,
  },
  {
    id: 'confirm_transaction',
    owner: 'portfolio_analyst',
    label: 'Confirm',
    sideEffect: 'write',
    requiresConfirmation: true,
  },
]

describe('attachToolCatalog', () => {
  it('lists the catalog in owner order and keeps calls on a matching tool', () => {
    const counts = summarizeOverview(
      [
        row({
          id: 'run-1',
          status: 'error',
          parent_run_id: 'parent-1',
          feature: 'portfolio_analyst',
          tools: [
            {
              name: 'get_holdings',
              ok: false,
              error: 'stale quote',
              latency_ms: 40,
              args: { symbol: 'AAPL' },
            },
          ],
        }),
        row({
          status: 'success',
          tools: [{ name: 'lookup', ok: true, args: {} }],
        }),
      ],
      { windowDays: 30, capped: false }
    ).toolErrorCounts

    const tools = attachToolCatalog(
      counts,
      catalog,
      coveredToolIds([{ toolsAnyOf: [['get_holdings']] }])
    )

    expect(tools.map((tool) => tool.name)).toEqual([
      'invoke_news_agent',
      'get_holdings',
      'confirm_transaction',
      'lookup',
    ])
    expect(tools[0]).toMatchObject({
      total: 0,
      errors: 0,
      owner: 'orchestrator',
      label: 'News agent',
      sideEffect: 'external',
      covered: false,
      inRegistry: true,
    })
    expect(tools[1]).toMatchObject({
      total: 1,
      errors: 1,
      covered: true,
      requiresConfirmation: false,
    })
    expect(tools[1].recent[0]).toMatchObject({
      runId: 'run-1',
      parentRunId: 'parent-1',
      error: 'stale quote',
      args: { symbol: 'AAPL' },
    })
    expect(tools[2]).toMatchObject({
      total: 0,
      requiresConfirmation: true,
      covered: false,
    })
    expect(tools[3]).toMatchObject({
      owner: null,
      inRegistry: false,
      covered: false,
      total: 1,
    })
  })

  it('covers confirm from a confirm flag and ignores a forbid-only name', () => {
    const forbidOnly = {
      forbiddenTools: ['remove_watchlist_item'],
      mustNotSucceedConfirm: true,
    }
    const covered = coveredToolIds([
      forbidOnly,
      { argsEquals: [{ tool: 'invoke_tax_agent' }] },
    ])
    expect(covered.has('confirm_transaction')).toBe(true)
    expect(covered.has('invoke_tax_agent')).toBe(true)
    expect(covered.has('remove_watchlist_item')).toBe(false)
  })
})
