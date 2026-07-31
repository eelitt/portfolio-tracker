/**
 * Finnish capital-gains constants for the estimator.
 * Verify annually against Verohallinto / statute — not live-fetched.
 *
 * Rates documented as applicable around tax year 2025–2026.
 */

/** Label shown in UI / tool payloads */
export const FINNISH_TAX_RATES_YEAR_LABEL = '2026 (verify annually)'

/** Pääomatulo: 30% up to this EUR amount of taxable capital income, then 34% */
export const CAPITAL_INCOME_THRESHOLD_EUR = 30_000
export const CAPITAL_INCOME_RATE_LOW = 0.3
export const CAPITAL_INCOME_RATE_HIGH = 0.34

/** Hankintameno-olettama as fraction of disposal proceeds */
export const HMO_RATE_UNDER_10Y = 0.2
export const HMO_RATE_FROM_10Y = 0.4
export const HMO_HOLDING_YEARS_FOR_40 = 10

/**
 * If total disposal proceeds in the tax year ≤ this, gains may be non-taxable
 * (incomplete without off-app disposals).
 */
export const SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR = 1_000

export const DEFAULT_DISCLAIMERS = [
  'Estimate only — not tax advice and not a substitute for OmaVero / a tax professional.',
  'Uses simplified Finnish capital-gains rules (luovutusvoitto, hankintameno-olettama, progressive pääomatulo rates).',
  'Off-app sales, other capital income, and incomplete history can change the real result.',
  'Crypto actual cost is often assessed FIFO; weighted average is shown for comparison with portfolio P&L.',
] as const
