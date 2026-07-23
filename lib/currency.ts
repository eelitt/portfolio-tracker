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
 * Default: 2 decimal places (stocks, most crypto).
 * BTC: up to 8 decimals so small amounts (e.g. 0.000391) are not rounded to 0,00.
 * Space thousand separator, comma decimal (e.g. 25 706,46).
 */
export function formatQuantity(
  quantity: number,
  _currency: Currency = 'USD',
  options?: { symbol?: string }
): string {
  const isBtc = options?.symbol?.toUpperCase() === 'BTC'
  return formatNumber(quantity, isBtc ? 8 : 2)
}

/**
 * Format a number with up to maxDecimals places.
 * Trailing zeros after the decimal are trimmed for maxDecimals > 2 (BTC).
 * Space as thousand separator, comma as decimal separator.
 */
function formatNumber(value: number, maxDecimals: number = 2): string {
  const isNegative = value < 0
  const absValue = Math.abs(value)
  let fixed = absValue.toFixed(maxDecimals)

  if (maxDecimals > 2) {
    // Trim trailing zeros: 0.00039100 → 0.000391; keep at least one digit after point if non-integer
    fixed = fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '')
    if (!fixed.includes('.')) {
      fixed = `${fixed}.00`
    }
  }

  const [intPart, decPart = '00'] = fixed.split('.')
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  return (isNegative ? '-' : '') + withSpaces + ',' + decPart
}
