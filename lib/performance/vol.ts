import type { DailyReturn } from './twr'

const MIN_DAYS_ANNUALIZE = 30

/**
 * Sample stdev of daily TWR decimals.
 * Annualize √365 only when n ≥ 30.
 */
export function returnVolatility(
  returns: DailyReturn[]
): {
  dailyStDev: number
  annualizedStDev: number | null
  n: number
} | null {
  if (returns.length < 2) return null
  const n = returns.length
  const mean = returns.reduce((s, d) => s + d.r, 0) / n
  let sumSq = 0
  for (const d of returns) {
    const x = d.r - mean
    sumSq += x * x
  }
  const dailyStDev = Math.sqrt(sumSq / (n - 1))
  if (!Number.isFinite(dailyStDev)) return null
  return {
    dailyStDev,
    annualizedStDev:
      n >= MIN_DAYS_ANNUALIZE ? dailyStDev * Math.sqrt(365) : null,
    n,
  }
}
