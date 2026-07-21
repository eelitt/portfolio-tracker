'use server'

import { getCryptoId } from './symbols'

/**
 * Price fetching service.
 *
 * Called from Server Components / Server Actions. Uses Next.js fetch
 * Data Cache with revalidate: 60 and tag `prices` so explicit refresh
 * can call revalidateTag('prices').
 *
 * On incomplete first pass, getPricesForHoldings retries missing asset
 * symbols with cache: 'no-store' so cold loads are not stuck on a bad cache.
 * That work still happens inside the awaited pipeline (Suspense skeletons).
 *
 * Stock / ETF: Finnhub (FINNHUB_API_KEY).
 * Crypto: CoinGecko (batched when fetching multiple holdings).
 * Cash: face value 1, change 0.
 */

export type PriceQuote = { price: number; change24h: number | null }

export type PriceFetchOptions = {
  /** Bypass Next Data Cache (used for retry pass). */
  forceFresh?: boolean
}

type HoldingInput = {
  symbol: string
  asset_type: 'stock' | 'etf' | 'crypto' | 'cash'
}

const PRICE_CACHE = { next: { revalidate: 60, tags: ['prices'] as string[] } }
const PRICE_NO_STORE = { cache: 'no-store' as const }
const RETRY_MISSING_DELAY_MS = 350

/** Reject missing, non-finite, and zero Finnhub empty quotes (c: 0). */
function isValidPrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0
}

function fetchInit(forceFresh?: boolean): RequestInit {
  return forceFresh ? PRICE_NO_STORE : PRICE_CACHE
}

async function fetchJson(
  url: string,
  options: { forceFresh?: boolean; retries?: number } = {}
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  const retries = options.retries ?? 1
  const init = fetchInit(options.forceFresh)
  try {
    const res = await fetch(url, init)
    if (!res.ok) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 250))
        return fetchJson(url, { ...options, retries: retries - 1 })
      }
      return { ok: false }
    }
    const data = await res.json()
    return { ok: true, data }
  } catch (error) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 250))
      return fetchJson(url, { ...options, retries: retries - 1 })
    }
    console.error('Price fetch error:', error)
    return { ok: false }
  }
}

// ==================== STOCKS (Finnhub) ====================

/**
 * Latest quote for a stock/ETF symbol.
 * Returns null on failure or invalid/zero last price.
 */
export async function getStockPrice(
  symbol: string,
  options: PriceFetchOptions = {}
): Promise<PriceQuote | null> {
  const apiKey = process.env.FINNHUB_API_KEY

  if (!apiKey) {
    console.error('Missing FINNHUB_API_KEY')
    return null
  }

  const result = await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
    { forceFresh: options.forceFresh }
  )
  if (!result.ok) return null

  const data = result.data as { c?: number; dp?: number | null }
  if (process.env.NODE_ENV === 'development') {
    console.log(`Fetched price for ${symbol}:`, data?.c)
  }

  if (!isValidPrice(data?.c)) return null

  return {
    price: data.c,
    change24h: typeof data.dp === 'number' && Number.isFinite(data.dp) ? data.dp : null,
  }
}

// ==================== CRYPTO (CoinGecko) ====================

/**
 * Single-symbol crypto price (tests + callers that need one id).
 * Prefer getPricesForHoldings for portfolios (batched).
 */
export async function getCryptoPrice(
  symbol: string,
  options: PriceFetchOptions = {}
): Promise<PriceQuote | null> {
  const id = getCryptoId(symbol)
  if (!id) return null

  const result = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`,
    { forceFresh: options.forceFresh }
  )
  if (!result.ok) return null

  const data = result.data as Record<string, { usd?: number; usd_24h_change?: number }>
  if (process.env.NODE_ENV === 'development') {
    console.log(`Fetched price for ${symbol}:`, data?.[id]?.usd)
  }

  const usd = data?.[id]?.usd
  if (!isValidPrice(usd)) return null

  const ch = data[id]?.usd_24h_change
  return {
    price: usd,
    change24h: typeof ch === 'number' && Number.isFinite(ch) ? ch : null,
  }
}

/**
 * Batch-fetch crypto prices in one CoinGecko request (avoids free-tier 429s).
 */
export async function getCryptoPricesBatch(
  symbols: string[],
  options: PriceFetchOptions = {}
): Promise<Record<string, PriceQuote>> {
  const out: Record<string, PriceQuote> = {}
  if (symbols.length === 0) return out

  const idToSymbol = new Map<string, string>()
  for (const symbol of symbols) {
    const id = getCryptoId(symbol)
    if (id) idToSymbol.set(id, symbol)
  }
  if (idToSymbol.size === 0) return out

  const ids = [...idToSymbol.keys()].join(',')
  const result = await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`,
    { forceFresh: options.forceFresh }
  )
  if (!result.ok) return out

  const data = result.data as Record<string, { usd?: number; usd_24h_change?: number }>
  for (const [id, symbol] of idToSymbol) {
    const row = data?.[id]
    if (!isValidPrice(row?.usd)) continue
    const ch = row.usd_24h_change
    out[symbol] = {
      price: row.usd,
      change24h: typeof ch === 'number' && Number.isFinite(ch) ? ch : null,
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`Fetched price for ${symbol}:`, row.usd)
    }
  }

  return out
}

// ==================== BATCH FETCH ====================

async function fetchPricesOnce(
  holdings: HoldingInput[],
  options: PriceFetchOptions = {}
): Promise<Record<string, PriceQuote>> {
  const priceData: Record<string, PriceQuote> = {}

  const cryptos = holdings.filter((h) => h.asset_type === 'crypto')
  const stocks = holdings.filter(
    (h) => h.asset_type === 'stock' || h.asset_type === 'etf'
  )
  const cash = holdings.filter((h) => h.asset_type === 'cash')

  for (const h of cash) {
    priceData[h.symbol] = { price: 1, change24h: 0 }
  }

  const cryptoSymbols = [...new Set(cryptos.map((h) => h.symbol))]
  const cryptoPromise =
    cryptoSymbols.length > 0
      ? getCryptoPricesBatch(cryptoSymbols, options)
      : Promise.resolve({} as Record<string, PriceQuote>)

  const stockPromises = stocks.map(async (holding) => {
    const result = await getStockPrice(holding.symbol, options)
    if (result) priceData[holding.symbol] = result
  })

  const [cryptoMap] = await Promise.all([cryptoPromise, Promise.all(stockPromises)])
  Object.assign(priceData, cryptoMap)

  return priceData
}

/**
 * Fetch current prices for holdings.
 * Crypto is batched; stocks/ETFs are parallel Finnhub quotes.
 * Only symbols with a valid price > 0 are included.
 *
 * If any non-cash holding is missing after the first pass, waits briefly and
 * retries those symbols with forceFresh (no-store) so first dashboard load
 * is less likely to show incomplete MV / 24h. Suspense skeletons cover the wait.
 */
export async function getPricesForHoldings(
  holdings: HoldingInput[]
): Promise<Record<string, PriceQuote>> {
  const priceData = await fetchPricesOnce(holdings)

  const missing = holdings.filter(
    (h) =>
      h.asset_type !== 'cash' &&
      !(
        priceData[h.symbol] &&
        isValidPrice(priceData[h.symbol].price)
      )
  )

  if (missing.length === 0) {
    return priceData
  }

  await new Promise((r) => setTimeout(r, RETRY_MISSING_DELAY_MS))

  const retryData = await fetchPricesOnce(missing, { forceFresh: true })
  Object.assign(priceData, retryData)

  return priceData
}
