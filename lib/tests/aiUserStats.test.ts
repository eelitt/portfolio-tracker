import { describe, expect, it } from 'vitest'
import { sumUsage, type UsageRow } from '@/lib/aiUsage/decide'
import {
  STUCK_RUN_MS,
  groupUserUsage,
  type UserStatSource,
} from '@/lib/aiUsage/userStats'

const start = new Date('2026-11-01T00:00:00.000Z')
const now = new Date('2026-11-24T12:00:00.000Z')

function row(
  partial: Partial<UserStatSource> & Pick<UserStatSource, 'createdAt' | 'feature'>
): UserStatSource {
  return {
    status: 'success',
    errorSummary: null,
    eval: false,
    confirmBlocked: false,
    ...partial,
  }
}

describe('groupUserUsage', () => {
  it('breaks a most-used tie by the newer row', () => {
    const stats = groupUserUsage(
      [
        row({ createdAt: '2026-11-10T00:00:00.000Z', feature: 'csv_import' }),
        row({ createdAt: '2026-11-12T00:00:00.000Z', feature: 'csv_import' }),
        row({ createdAt: '2026-11-11T00:00:00.000Z', feature: 'portfolio_insights' }),
        row({ createdAt: '2026-11-20T00:00:00.000Z', feature: 'portfolio_insights' }),
      ],
      start,
      now
    )
    expect(stats.mostUsed).toEqual({ feature: 'portfolio_insights', count: 2 })
    expect(stats.calls).toBe(4)
  })

  it('leaves eval out of the product counts and still records it as the last call', () => {
    const stats = groupUserUsage(
      [
        row({
          createdAt: '2026-11-15T00:00:00.000Z',
          feature: 'portfolio_orchestrator',
          confirmBlocked: true,
        }),
        row({
          createdAt: '2026-11-22T00:00:00.000Z',
          feature: 'portfolio_analyst',
          status: 'error',
          errorSummary: 'eval blew up',
          eval: true,
          confirmBlocked: true,
        }),
      ],
      start,
      now
    )
    expect(stats.calls).toBe(1)
    expect(stats.errors).toBe(0)
    expect(stats.confirmBlocked).toBe(1)
    expect(stats.mostUsed).toEqual({
      feature: 'portfolio_orchestrator',
      count: 1,
    })
    expect(stats.lastCall).toMatchObject({
      feature: 'portfolio_analyst',
      eval: true,
      status: 'error',
    })
    expect(stats.lastError).toBeNull()
  })

  it('counts a running row only after 10 minutes', () => {
    const fresh = new Date(now.getTime() - STUCK_RUN_MS + 1000).toISOString()
    const stuck = new Date(now.getTime() - STUCK_RUN_MS).toISOString()
    const stats = groupUserUsage(
      [
        row({ createdAt: fresh, feature: 'csv_import', status: 'running' }),
        row({ createdAt: stuck, feature: 'csv_import', status: 'running' }),
        row({
          createdAt: '2026-10-01T00:00:00.000Z',
          feature: 'csv_import',
          status: 'success',
        }),
      ],
      start,
      now
    )
    expect(stats.stuck).toBe(1)
    expect(stats.calls).toBe(2)
  })

  it('keeps the product dollar on sumUsage', () => {
    const usage: UsageRow[] = [
      {
        userId: 'u',
        createdAt: '2026-11-10T00:00:00.000Z',
        promptTokens: 10,
        completionTokens: 2,
        estimatedCostUsd: 0.25,
        eval: false,
      },
      {
        userId: 'u',
        createdAt: '2026-11-11T00:00:00.000Z',
        promptTokens: 10,
        completionTokens: 2,
        estimatedCostUsd: 0.5,
        eval: true,
      },
      {
        userId: 'u',
        createdAt: '2026-10-01T00:00:00.000Z',
        promptTokens: 10,
        completionTokens: 2,
        estimatedCostUsd: 1,
        eval: false,
      },
    ]
    const stats = groupUserUsage(
      usage.map((r) =>
        row({
          createdAt: r.createdAt,
          feature: r.eval ? 'portfolio_analyst' : 'csv_import',
          eval: r.eval,
        })
      ),
      start,
      now
    )
    expect(sumUsage(usage, 'u', start, 'product').estimatedUsd).toBe(0.25)
    expect(sumUsage(usage, 'u', null, 'product').estimatedUsd).toBe(1.25)
    expect(sumUsage(usage, 'u', null, 'eval').estimatedUsd).toBe(0.5)
    expect(stats.calls).toBe(1)
  })
})
