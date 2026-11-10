import type { PreferredCurrency } from '@/lib/userTypes'

export type Currency = PreferredCurrency

/** Stored on a cash row. Preferred display currency stays USD or EUR. */
export const CASH_DENOMINATIONS = ['USD', 'EUR', 'USDT', 'USDC'] as const
export type CashDenomination = (typeof CASH_DENOMINATIONS)[number]

export function isCashDenomination(
  value: string | null | undefined
): value is CashDenomination {
  return value === 'USD' || value === 'EUR' || value === 'USDT' || value === 'USDC'
}

export function isStableCash(
  value: string | null | undefined
): value is 'USDT' | 'USDC' {
  return value === 'USDT' || value === 'USDC'
}

/**
 * Held as for a new cash row opened from a holding card.
 * One stable and no fiat balance uses that stable. Anything mixed, or fiat only, uses the preferred currency.
 */
export function heldAsForCashCard(
  parts: { fiatPreferred: number; stables: { currency: 'USDT' | 'USDC' }[] } | undefined,
  preferred: PreferredCurrency
): CashDenomination {
  if (!parts || parts.fiatPreferred !== 0 || parts.stables.length !== 1) return preferred
  return parts.stables[0].currency
}

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
 * Cash face in USD. EUR uses the rate. USDT and USDC are $1.
 * Any other denomination, including a missing one, stays USD.
 */
export function cashFaceInUsd(
  amount: number,
  currency: string | null | undefined,
  usdToEurRate: number
): number {
  const rate = usdToEurRate > 0 && Number.isFinite(usdToEurRate) ? usdToEurRate : 0.92
  if ((currency || '').toUpperCase() === 'EUR') return amount / rate
  return amount
}

/**
 * Dollar value of one cash face, rounded to the cent.
 * A stored fiat value wins over today's rate. A stable is always its face.
 * A fiat row with no stored value uses today's rate.
 */
export function ledgerFiatUsd(
  face: number,
  currency: string | null | undefined,
  usdToEurRate: number,
  storedUsd?: number | null
): number {
  if (!Number.isFinite(face)) return 0
  if (isStableCash(currency)) return Number(face.toFixed(2))
  if (storedUsd != null && Number.isFinite(Number(storedUsd))) {
    return Number(Number(storedUsd).toFixed(2))
  }
  return Number(cashFaceInUsd(face, currency, usdToEurRate).toFixed(2))
}

/** Dollar value to store on a new or edited fiat cash row. Null for a stable. */
export function frozenFiatUsd(
  currency: string | null | undefined,
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
  usdToEurRate: number
): number | null {
  if (isStableCash(currency)) return null
  const face = Number(quantity) * Number(unitPrice ?? 1)
  if (!Number.isFinite(face)) return null
  return ledgerFiatUsd(face, currency, usdToEurRate, null)
}

/** Unit price as the edit form should show it: preferred currency, same path as the table. */
export function unitPriceShownInPreferred(
  unitPrice: number,
  entryCurrency: Currency,
  preferredCurrency: Currency,
  usdToEurRate: number
): number {
  const rate = usdToEurRate > 0 ? usdToEurRate : 0.92
  const shown = convertBetweenCurrencies(unitPrice, entryCurrency, preferredCurrency, rate)
  return Number(shown.toFixed(8))
}

/**
 * Value to write back on the ledger row.
 * An unchanged field keeps the original entry-currency price so FX rounding does not drift.
 */
export function unitPriceToStore(
  entered: number,
  shownBaseline: number,
  originalUnitPrice: number,
  entryCurrency: Currency,
  preferredCurrency: Currency,
  usdToEurRate: number
): number {
  if (!Number.isFinite(entered)) return originalUnitPrice
  if (Math.abs(entered - shownBaseline) < 1e-8) return originalUnitPrice
  const rate = usdToEurRate > 0 ? usdToEurRate : 0.92
  return convertBetweenCurrencies(entered, preferredCurrency, entryCurrency, rate)
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
