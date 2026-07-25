/**
 * Live Binance spot tickers (last price + 24h change %).
 * Portfolio marks only — chart OHLC lives under lib/priceHistory.
 */

import { binanceBaseUrl } from './binanceBase'

export type BinanceTickerQuote = {
  price: number
  change24h: number | null
}

function parsePx(s: unknown): number | null {
  const n = typeof s === 'string' ? Number(s) : typeof s === 'number' ? s : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function parseChangePct(s: unknown): number | null {
  const n = typeof s === 'string' ? Number(s) : typeof s === 'number' ? s : NaN
  if (!Number.isFinite(n)) return null
  return n
}

/**
 * Build GET /api/v3/ticker/24hr?symbols=[...] URL for a list of pairs.
 */
export function buildBinance24hrUrl(pairs: string[]): string {
  const unique = [
    ...new Set(pairs.map((p) => p.trim().toUpperCase()).filter(Boolean)),
  ]
  const symbolsParam = encodeURIComponent(JSON.stringify(unique))
  return `${binanceBaseUrl()}/api/v3/ticker/24hr?symbols=${symbolsParam}`
}

/**
 * Parse Binance 24hr ticker payload (array or single object) into pair → quote.
 */
export function parseBinance24hrTickers(
  raw: unknown
): Record<string, BinanceTickerQuote> {
  const out: Record<string, BinanceTickerQuote> = {}
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? [raw]
      : []

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const symbol =
      typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
    if (!symbol) continue

    const price = parsePx(r.lastPrice)
    if (price == null) continue

    const change24h = parseChangePct(r.priceChangePercent)
    out[symbol] = { price, change24h }
  }

  return out
}
