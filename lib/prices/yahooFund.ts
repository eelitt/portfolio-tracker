/**
 * Mutual-fund NAV via Yahoo Finance chart JSON (not HTML scraping).
 *
 * Used for catalog instruments that Finnhub does not quote (e.g. Finnish UCITS).
 * Yahoo chart is unofficial — parse carefully and fail closed on bad payloads.
 */

export type YahooFundQuote = {
  price: number
  change24h: number | null
  currency?: string
}

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

/** Longer TTL: fund NAV is typically end-of-day, not intraday. */
const YAHOO_FUND_CACHE = {
  next: { revalidate: 3600, tags: ['prices'] as string[] },
}
const YAHOO_FUND_NO_STORE = { cache: 'no-store' as const }

const YAHOO_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (compatible; PortfolioTracker/1.0; +https://localhost)',
  Accept: 'application/json',
}

export type YahooChartPayload = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string
        regularMarketPrice?: number
        chartPreviousClose?: number
        previousClose?: number
      }
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>
        }>
      }
    }>
    error?: unknown
  }
}

function isValidPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0
}

/**
 * Pure parser for Yahoo chart JSON → price + day-over-day % change.
 * change24h is NAV day change (not exchange 24h session).
 */
export function parseYahooChartNav(data: unknown): YahooFundQuote | null {
  const payload = data as YahooChartPayload
  const result = payload?.chart?.result?.[0]
  if (!result) return null

  const meta = result.meta
  const price = meta?.regularMarketPrice
  if (!isValidPrice(price)) return null

  let change24h: number | null = null
  const closes = result.indicators?.quote?.[0]?.close?.filter(
    (c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0
  )
  if (closes && closes.length >= 2) {
    const prev = closes[closes.length - 2]
    const last = closes[closes.length - 1]
    if (prev > 0) {
      change24h = Number((((last - prev) / prev) * 100).toFixed(4))
    }
  } else {
    const prevClose = meta?.chartPreviousClose ?? meta?.previousClose
    if (isValidPrice(prevClose)) {
      change24h = Number((((price - prevClose) / prevClose) * 100).toFixed(4))
    }
  }

  return {
    price,
    change24h,
    currency: typeof meta?.currency === 'string' ? meta.currency : undefined,
  }
}

function buildYahooChartUrl(yahooSymbol: string): string {
  const sym = encodeURIComponent(yahooSymbol.trim())
  return `${YAHOO_CHART_BASE}/${sym}?interval=1d&range=5d`
}

/**
 * Fetch fund NAV for a Yahoo chart symbol (e.g. 0P0001IFBB.F).
 * Returns null on network/parse failure.
 */
export async function fetchYahooFundNav(
  yahooSymbol: string,
  options: { forceFresh?: boolean } = {}
): Promise<YahooFundQuote | null> {
  if (!yahooSymbol?.trim()) return null

  const url = buildYahooChartUrl(yahooSymbol)
  const init: RequestInit = {
    ...(options.forceFresh ? YAHOO_FUND_NO_STORE : YAHOO_FUND_CACHE),
    headers: YAHOO_HEADERS,
  }

  try {
    const res = await fetch(url, init)
    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Yahoo fund NAV HTTP ${res.status} for ${yahooSymbol}`)
      }
      return null
    }
    const data = await res.json()
    const parsed = parseYahooChartNav(data)
    if (!parsed) return null

    if (parsed.currency && parsed.currency !== 'EUR' && process.env.NODE_ENV === 'development') {
      console.warn(
        `Yahoo fund ${yahooSymbol} currency is ${parsed.currency}, expected EUR for S-Pankki-style funds`
      )
    }

    return parsed
  } catch (err) {
    console.error('Yahoo fund NAV fetch error:', err)
    return null
  }
}

export { buildYahooChartUrl }
