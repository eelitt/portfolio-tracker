/**
 * Curated symbol lists for transaction form dropdowns (+ crypto / fund pricing maps).
 *
 * - Users can only pick symbols that exist in these lists for the chosen asset type.
 * - To support a new instrument, add it to the appropriate .json file.
 * - Crypto rows: either `stable: true` (face $1) or `binance_symbol` (Binance USDT pair).
 * - ETF rows may include optional `pricing` for mutual-fund NAV (Yahoo chart), not Finnhub.
 *
 * Price APIs are never called for the full lists — only for open holdings.
 */

import stocksJson from './symbols/stocks.json' with { type: 'json' }
import etfsJson from './symbols/etfs.json' with { type: 'json' }
import cryptosJson from './symbols/cryptos.json' with { type: 'json' }

export interface AssetSymbol {
  symbol: string
  name: string
}

/** Optional catalog pricing for instruments Finnhub cannot quote (e.g. Finnish funds). */
export type SecurityCatalogPricing = {
  provider: 'yahoo_chart'
  yahooSymbol: string
}

export interface EtfSymbol extends AssetSymbol {
  isin?: string
  /** Currency of the external NAV/quote before pipeline normalizes to USD. */
  quoteCurrency?: 'USD' | 'EUR'
  pricing?: SecurityCatalogPricing
}

export interface CryptoSymbol {
  symbol: string
  name: string
  /** Binance spot pair (e.g. BTCUSDT). Omit when stable. */
  binance_symbol?: string | null
  /** USD-pegged face value 1 — no live quote. */
  stable?: boolean
  market_cap_rank?: number
}

export type CryptoPricing =
  | { kind: 'binance'; pair: string }
  | { kind: 'stable' }
  | { kind: 'none' }

export type SecurityPricing =
  | {
      kind: 'yahoo_chart'
      yahooSymbol: string
      quoteCurrency: 'USD' | 'EUR'
    }
  | { kind: 'finnhub' }

export const STOCK_SYMBOLS: AssetSymbol[] = stocksJson as AssetSymbol[]
export const ETF_SYMBOLS: EtfSymbol[] = etfsJson as EtfSymbol[]
export const CRYPTO_SYMBOLS: CryptoSymbol[] = cryptosJson as CryptoSymbol[]

const CRYPTO_BY_SYMBOL = new Map(
  CRYPTO_SYMBOLS.map((c) => [c.symbol.toUpperCase(), c] as const)
)

const ETF_BY_SYMBOL = new Map(
  ETF_SYMBOLS.map((e) => [e.symbol.toUpperCase(), e] as const)
)

/**
 * Returns the list of {symbol, name} for a given asset type.
 * Used by the UI dropdown to populate options.
 */
export function getSymbolsForType(
  assetType: 'stock' | 'etf' | 'crypto' | 'cash' | string
): AssetSymbol[] {
  switch (assetType) {
    case 'stock':
      return STOCK_SYMBOLS
    case 'etf':
      return ETF_SYMBOLS
    case 'crypto':
      return CRYPTO_SYMBOLS.map((c) => ({ symbol: c.symbol, name: c.name }))
    default:
      return []
  }
}

/**
 * How to price a stock/ETF catalog symbol for live portfolio quotes.
 * Catalog funds with `pricing.provider: yahoo_chart` skip Finnhub.
 * Everything else uses Finnhub exchange quotes (default).
 */
export function getSecurityPricing(ticker: string): SecurityPricing {
  const upper = (ticker || '').trim().toUpperCase()
  if (!upper) return { kind: 'finnhub' }

  const row = ETF_BY_SYMBOL.get(upper)
  if (row?.pricing?.provider === 'yahoo_chart' && row.pricing.yahooSymbol?.trim()) {
    return {
      kind: 'yahoo_chart',
      yahooSymbol: row.pricing.yahooSymbol.trim(),
      quoteCurrency: row.quoteCurrency === 'EUR' ? 'EUR' : 'USD',
    }
  }
  return { kind: 'finnhub' }
}

/**
 * How to price a crypto ticker for live portfolio quotes.
 * Catalog first; legacy holdings fall back to `${TICKER}USDT` when not listed
 * (except known stables).
 */
export function getCryptoPricing(ticker: string): CryptoPricing {
  const upper = (ticker || '').trim().toUpperCase()
  if (!upper) return { kind: 'none' }

  const row = CRYPTO_BY_SYMBOL.get(upper)
  if (row) {
    if (row.stable === true) return { kind: 'stable' }
    const pair = (row.binance_symbol || '').trim().toUpperCase()
    if (pair) return { kind: 'binance', pair }
    return { kind: 'none' }
  }

  // Legacy / unlisted holdings: convention fallback (charts + live prices)
  const STABLES = new Set([
    'USDT',
    'USDC',
    'BUSD',
    'DAI',
    'TUSD',
    'FDUSD',
    'USDE',
    'USDS',
    'USD',
  ])
  if (STABLES.has(upper)) return { kind: 'stable' }
  if (upper.endsWith('USDT') && upper.length > 4) {
    return { kind: 'binance', pair: upper }
  }
  return { kind: 'binance', pair: `${upper}USDT` }
}

/**
 * Builds option objects for a <select>.
 * If preserveValue is supplied and not already present in the list for this type,
 * it is prepended so that editing an old transaction whose symbol was removed
 * from the json still works.
 */
export function getSymbolOptions(
  assetType: 'stock' | 'etf' | 'crypto' | 'cash' | string,
  preserveValue?: string
): Array<{ value: string; label: string }> {
  if (assetType === 'cash') {
    return []
  }

  const base = getSymbolsForType(assetType)
  const options = base.map((entry) => ({
    value: entry.symbol,
    label: `${entry.symbol} — ${entry.name}`,
  }))

  if (preserveValue && !options.some((o) => o.value === preserveValue)) {
    options.unshift({
      value: preserveValue,
      label: `${preserveValue} — (previous)`,
    })
  }

  return options
}
