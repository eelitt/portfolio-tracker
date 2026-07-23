import type { PreferredCurrency } from '@/lib/userTypes'

export type Currency = PreferredCurrency

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
}

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency] || '$'
}

/**
 * Fetches the current USD -> EUR exchange rate.
 * Uses a free public API with caching.
 * Falls back to a reasonable default (~0.92) if the API fails.
 */
export async function getUsdToEurRate(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', {
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    if (!res.ok) throw new Error('Rate fetch failed')

    const data = await res.json()
    const rate = data?.rates?.EUR

    if (typeof rate === 'number' && rate > 0) {
      return rate
    }
  } catch (err) {
    console.warn('Failed to fetch EUR rate, using fallback', err)
  }

  return 0.92 // sensible fallback
}

export function convertAmount(
  amount: number,
  toCurrency: Currency,
  usdToEurRate: number
): number {
  if (toCurrency === 'USD') return amount
  return amount * usdToEurRate
}

/**
 * Convert an amount that was denominated in fromCurrency into its USD equivalent.
 * Used before formatting or when normalizing market asset prices.
 */
export function getAmountInUsd(
  amount: number,
  fromCurrency: Currency,
  usdToEurRate: number
): number {
  if (fromCurrency === 'USD') return amount
  return amount / usdToEurRate
}

/**
 * Convert an amount from one supported currency to another via USD.
 * Identity when from === to.
 */
export function convertBetweenCurrencies(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  usdToEurRate: number
): number {
  if (fromCurrency === toCurrency) return amount
  const inUsd = getAmountInUsd(amount, fromCurrency, usdToEurRate)
  return convertAmount(inUsd, toCurrency, usdToEurRate)
}

export function formatCurrency(
  amount: number,
  currency: Currency,
  usdToEurRate: number = 1
): string {
  const converted = convertAmount(amount, currency, usdToEurRate)
  const symbol = getCurrencySymbol(currency)
  return symbol + formatNumber(converted)
}

/**
 * Formats a quantity (e.g. number of shares or crypto tokens) for display.
 * Uses 2 decimal places with space as thousand separator (e.g. 25 706,46).
 * Used in holdings display for non-cash assets.
 */
export function formatQuantity(quantity: number, currency: Currency = 'USD'): string {
  return formatNumber(quantity)
}

/**
 * Internal helper to format a number with exactly 2 decimals,
 * using space as thousand separator and comma as decimal separator.
 * Example: 25706.46 -> "25 706,46"
 */
function formatNumber(value: number): string {
  const isNegative = value < 0
  const absValue = Math.abs(value)
  const fixed = absValue.toFixed(2)
  const [intPart, decPart] = fixed.split('.')

  // Add space as thousand separator (every 3 digits from the right)
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  return (isNegative ? '-' : '') + withSpaces + ',' + decPart
}
