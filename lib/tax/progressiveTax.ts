/**
 * Progressive Finnish capital-income tax on a taxable base (EUR).
 */

import {
  CAPITAL_INCOME_RATE_HIGH,
  CAPITAL_INCOME_RATE_LOW,
  CAPITAL_INCOME_THRESHOLD_EUR,
} from './finnishRates'

export function roundMoney(n: number): number {
  return Number(n.toFixed(2))
}

/**
 * Tax on `taxableGainEur` when the taxpayer already has `otherCapitalIncomeEur`
 * of other taxable capital income in the same year (fills the 30% band first).
 */
export function estimateProgressiveCapitalTax(
  taxableGainEur: number,
  otherCapitalIncomeEur = 0
): { taxEur: number; effectiveRate: number | null } {
  const gain = Math.max(0, taxableGainEur)
  if (gain <= 0) {
    return { taxEur: 0, effectiveRate: null }
  }

  const other = Math.max(0, otherCapitalIncomeEur)
  const lowBandRemaining = Math.max(0, CAPITAL_INCOME_THRESHOLD_EUR - other)
  const inLow = Math.min(gain, lowBandRemaining)
  const inHigh = Math.max(0, gain - inLow)
  const taxEur = roundMoney(inLow * CAPITAL_INCOME_RATE_LOW + inHigh * CAPITAL_INCOME_RATE_HIGH)
  const effectiveRate = gain > 0 ? Number((taxEur / gain).toFixed(4)) : null
  return { taxEur, effectiveRate }
}
