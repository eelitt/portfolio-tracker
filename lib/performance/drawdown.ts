import type { DailyReturn } from './twr'

/**
 * Max peak-to-trough on the TWR wealth index (start = 1).
 * drawdown is ≤ 0 (e.g. −0.20 = −20%).
 */
export function maxDrawdownFromReturns(
  returns: DailyReturn[]
): { drawdown: number } | null {
  if (returns.length === 0) return null
  let index = 1
  let peak = 1
  let maxDd = 0
  for (const { r } of returns) {
    index *= 1 + r
    if (!Number.isFinite(index)) return null
    if (index > peak) peak = index
    if (peak > 0) {
      const dd = (index - peak) / peak
      if (dd < maxDd) maxDd = dd
    }
  }
  return { drawdown: maxDd }
}
