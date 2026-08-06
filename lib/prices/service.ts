'use server'

import { getCryptoPricing, getSecurityPricing } from '@/lib/symbols'
import { getUsdToEurRate } from '@/lib/currency'
import {
  buildBinance24hrUrl,
  parseBinance24hrTickers,
} from './binanceTicker'
import { fetchYahooFundNav } from './yahooFund'

/**
 * Live portfolio price service (Finnhub stocks/ETFs + Binance crypto +
 * catalog Yahoo-chart fund NAVs).
 *
 * Chart OHLC / history: lib/priceHistory — not this module.
 *
 * Portfolio KPIs (getPricesForHoldings) default to cache: 'no-store' so the
 * first dashboard paint uses live quotes. Optional forceFresh: false re-enables
 * short-lived tag `prices` caching.
 *
 * Pipeline contract: returned quotes are in **USD** so convertToPreferred can
 * treat market marks as USD. EUR fund NAVs are converted here via USD/EUR.
 */

export type PriceQuote = { price: number; change24h: number | null }

export type PriceFetchOptions = {
  /**
   * Bypass Next Data Cache (no-store).
   * getPricesForHoldings defaults this to true for trustworthy portfolio math.
   */
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

// ==================== CRYPTO (Binance) ====================

/**
 * Single-symbol crypto price (tests + single-ticker callers).
 * Prefer getPricesForHoldings for portfolios (batched).
 */
export async function getCryptoPrice(
  symbol: string,
  options: PriceFetchOptions = {}
): Promise<PriceQuote | null> {
  const batch = await getCryptoPricesBatch([symbol], options)
  return batch[symbol] ?? null
}

/**
 * Batch-fetch crypto prices in one Binance 24hr request.
 * Stables resolve locally to face value 1 (no network).
 */
export async function getCryptoPricesBatch(
  symbols: string[],
  options: PriceFetchOptions = {}
): Promise<Record<string, PriceQuote>> {
  const out: Record<string, PriceQuote> = {}
  if (symbols.length === 0) return out

  /** Binance pair → portfolio ticker(s) — usually 1:1 */
  const pairToTickers = new Map<string, string[]>()

  for (const symbol of symbols) {
    const pricing = getCryptoPricing(symbol)
    if (pricing.kind === 'stable') {
      out[symbol] = { price: 1, change24h: 0 }
      continue
    }
    if (pricing.kind === 'none') continue

    const list = pairToTickers.get(pricing.pair) ?? []
    list.push(symbol)
    pairToTickers.set(pricing.pair, list)
  }

  if (pairToTickers.size === 0) return out

  const pairs = [...pairToTickers.keys()]
  const url = buildBinance24hrUrl(pairs)
  const result = await fetchJson(url, { forceFresh: options.forceFresh })
  if (!result.ok) return out

  const byPair = parseBinance24hrTickers(result.data)
  for (const [pair, tickers] of pairToTickers) {
    const quote = byPair[pair]
    if (!quote || !isValidPrice(quote.price)) continue
    for (const symbol of tickers) {
      out[symbol] = {
        price: quote.price,
        change24h: quote.change24h,
      }
      if (process.env.NODE_ENV === 'development') {
        console.log(`Fetched price for ${symbol}:`, quote.price)
      }
    }
  }

  return out
}

// ==================== BATCH FETCH ====================

async function getCatalogYahooPrice(
  portfolioSymbol: string,
  options: PriceFetchOptions,
  usdToEurRate: number
): Promise<PriceQuote | null> {
  const pricing = getSecurityPricing(portfolioSymbol)
  if (pricing.kind !== 'yahoo_chart') return null

  const nav = await fetchYahooFundNav(pricing.yahooSymbol, {
    forceFresh: options.forceFresh,
  })
  if (!nav || !isValidPrice(nav.price)) return null

  // Normalize to USD for the portfolio pipeline (toPreferredHolding).
  let priceUsd = nav.price
  const quoteCur = pricing.quoteCurrency
  if (quoteCur === 'EUR') {
    if (!(usdToEurRate > 0)) return null
    priceUsd = nav.price / usdToEurRate
  }

  if (!isValidPrice(priceUsd)) return null

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `Fetched Yahoo fund NAV for ${portfolioSymbol} (${pricing.yahooSymbol}):`,
      nav.price,
      nav.currency ?? quoteCur,
      '→ USD',
      priceUsd
    )
  }

  return {
    price: priceUsd,
    change24h: nav.change24h,
  }
}

async function fetchPricesOnce(
  holdings: HoldingInput[],
  options: PriceFetchOptions = {}
): Promise<Record<string, PriceQuote>> {
  const priceData: Record<string, PriceQuote> = {}

  const cryptos = holdings.filter((h) => h.asset_type === 'crypto')
  const securities = holdings.filter(
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

  const needsEurFx = securities.some((h) => {
    const p = getSecurityPricing(h.symbol)
    return p.kind === 'yahoo_chart' && p.quoteCurrency === 'EUR'
  })
  const usdToEurRate = needsEurFx ? await getUsdToEurRate() : 1

  const securityPromises = securities.map(async (holding) => {
    const routing = getSecurityPricing(holding.symbol)
    if (routing.kind === 'yahoo_chart') {
      const result = await getCatalogYahooPrice(
        holding.symbol,
        options,
        usdToEurRate
      )
      if (result) priceData[holding.symbol] = result
      return
    }
    const result = await getStockPrice(holding.symbol, options)
    if (result) priceData[holding.symbol] = result
  })

  const [cryptoMap] = await Promise.all([
    cryptoPromise,
    Promise.all(securityPromises),
  ])
  Object.assign(priceData, cryptoMap)

  return priceData
}

/**
 * Fetch current prices for holdings.
 * Crypto is batched; stocks/ETFs are parallel Finnhub quotes.
 * Only symbols with a valid price > 0 are included.
 *
 * Defaults to forceFresh (live API) so dashboard MV / P&L / 24h are trustworthy
 * on first load — not a mix of stale Data Cache entries. Pass forceFresh: false
 * only if you explicitly want the 60s tagged cache.
 *
 * If any non-cash holding is missing after the first pass, waits briefly and
 * retries those symbols (still forceFresh). Suspense skeletons cover the wait.
 */
export async function getPricesForHoldings(
  holdings: HoldingInput[],
  options: PriceFetchOptions = {}
): Promise<Record<string, PriceQuote>> {
  // Portfolio correctness: fresh by default (undefined → true)
  const forceFresh = options.forceFresh !== false
  const fetchOpts: PriceFetchOptions = { forceFresh }

  const priceData = await fetchPricesOnce(holdings, fetchOpts)

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
