import type { PreferredCurrency } from '@/lib/userTypes'
import type { MonthlyContribution } from './types'

export const CONTRIBUTION_BANDS: MonthlyContribution[] = [
  'none',
  '1_500',
  '500_1000',
  '1000_5000',
  '5000_plus',
]

const RANGE: Record<Exclude<MonthlyContribution, 'none'>, string> = {
  '1_500': '1–500',
  '500_1000': '500–1,000',
  '1000_5000': '1,000–5,000',
  '5000_plus': '5,000+',
}

export function formatContributionLabel(
  band: MonthlyContribution,
  currency: PreferredCurrency
): string {
  if (band === 'none') return 'None'
  const symbol = currency === 'EUR' ? '€' : '$'
  return `${symbol}${RANGE[band]}`
}

/** Agent context: "contributes 500–1,000 EUR/month" */
export function formatContributionContext(
  band: MonthlyContribution,
  currency: PreferredCurrency
): string {
  if (band === 'none') return 'contributes nothing monthly'
  return `contributes ${RANGE[band]} ${currency}/month`
}
