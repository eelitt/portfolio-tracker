import type { SnapshotPoint } from '@/lib/aggregateSnapshots'
import {
  netCashFlowInRange,
  type CashFlow,
} from './cashFlows'

export type DailyReturn = { date: string; r: number }

/**
 * Daily TWR steps between consecutive snapshots.
 * r_t = (MV_t − MV_{t−1} − CF_t) / MV_{t−1}
 * CF_t = cash inflow−outflow with date in (prev snapshot, this snapshot].
 */
export function dailyTwrs(
  points: SnapshotPoint[],
  flows: CashFlow[]
): DailyReturn[] {
  if (points.length < 2) return []
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const out: DailyReturn[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    if (!(prev.marketValue > 0)) continue
    const cf = netCashFlowInRange(flows, prev.date, cur.date)
    const r = (cur.marketValue - prev.marketValue - cf) / prev.marketValue
    if (!Number.isFinite(r)) continue
    out.push({ date: cur.date, r })
  }
  return out
}

/** Geometric link of daily TWR decimals. Null if none. */
export function linkedReturn(returns: DailyReturn[]): number | null {
  if (returns.length === 0) return null
  let g = 1
  for (const { r } of returns) {
    g *= 1 + r
    if (!Number.isFinite(g)) return null
  }
  return g - 1
}
