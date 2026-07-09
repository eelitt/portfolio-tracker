import { PreferredCurrency } from '@/app/actions/users'

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

export function formatCurrency(
  amount: number,
  currency: Currency,
  usdToEurRate: number = 1
): string {
  const converted = convertAmount(amount, currency, usdToEurRate)
  const symbol = getCurrencySymbol(currency)
  // Use proper locale formatting
  const locale = currency === 'EUR' ? 'de-DE' : 'en-US'
  return symbol + converted.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
