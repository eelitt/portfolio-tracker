import { describe, expect, it } from 'vitest'
import {
  pickOverviewRows,
  summarizeOverview,
  type OverviewSourceRow,
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

describe('pickOverviewRows', () => {
  it('keeps the window when it has rows', () => {
    expect(pickOverviewRows([{ id: 'w' }], [{ id: 'l' }])).toEqual({
      rows: [{ id: 'w' }],
      outsideWindow: false,
    })
  })

  it('uses the latest rows when the window is empty', () => {
    expect(pickOverviewRows([], [{ id: 'l' }])).toEqual({
      rows: [{ id: 'l' }],
      outsideWindow: true,
    })
  })

  it('stays empty when the table has no rows', () => {
    expect(pickOverviewRows([], [])).toEqual({
      rows: [],
      outsideWindow: false,
    })
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
      { windowDays: 30, outsideWindow: false }
    )
    expect(stats.totalRuns).toBe(3)
    expect(stats.errorRate).toBeCloseTo(1 / 3)
    expect(stats.successCount).toBe(1)
    expect(stats.errorCount).toBe(1)
    expect(stats.partialCount).toBe(0)
    expect(stats.avgDurationMs).toBe(100)
    expect(stats.avgEstimatedCostUsd).toBe(0.25)
    expect(stats.avgTotalTokens).toBe(10)
    expect(stats.confirmAttempts).toBe(1)
    expect(stats.confirmSuccess).toBe(1)
    expect(stats.confirmBlocked).toBe(0)
    expect(stats.toolErrorCounts).toEqual([
      { name: 'prepare_transaction', errors: 1, total: 2 },
    ])
    expect(stats.oldestAt).toBe('2026-11-01T00:00:00.000Z')
    expect(stats.newestAt).toBe('2026-11-03T00:00:00.000Z')
  })

  it('returns empty averages when there are no rows', () => {
    const stats = summarizeOverview([], { windowDays: 30, outsideWindow: true })
    expect(stats.errorRate).toBe(0)
    expect(stats.avgDurationMs).toBeNull()
    expect(stats.avgEstimatedCostUsd).toBeNull()
    expect(stats.outsideWindow).toBe(true)
  })
})
