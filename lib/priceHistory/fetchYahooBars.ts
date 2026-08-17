import type { PriceBar } from './types'

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

const YAHOO_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (compatible; PortfolioTracker/1.0; +https://localhost)',
  Accept: 'application/json',
}

type YahooHistoryPayload = {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
    error?: unknown
  }
}

function isValidPx(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

export function buildYahooHistoryUrl(
  yahooSymbol: string,
  fromUnix: number,
  toUnix: number
): string {
  const sym = encodeURIComponent(yahooSymbol.trim())
  return `${YAHOO_CHART_BASE}/${sym}?interval=1d&period1=${fromUnix}&period2=${toUnix}`
}

/**
 * Pure parser: Yahoo chart JSON → daily OHLC.
 * Close-only rows use close for O/H/L so candles still draw.
 */
export function parseYahooDailyBars(data: unknown): PriceBar[] {
  const payload = data as YahooHistoryPayload
  if (payload?.chart?.error) return []
  const result = payload?.chart?.result?.[0]
  const ts = result?.timestamp
  const quote = result?.indicators?.quote?.[0]
  if (!ts?.length || !quote) return []

  const bars: PriceBar[] = []
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]
    const close = quote.close?.[i]
    if (typeof t !== 'number' || !Number.isFinite(t) || !isValidPx(close)) {
      continue
    }
    const rawOpen = quote.open?.[i]
    const rawHigh = quote.high?.[i]
    const rawLow = quote.low?.[i]
    const open = isValidPx(rawOpen) ? rawOpen : close
    const high = isValidPx(rawHigh) ? rawHigh : close
    const low = isValidPx(rawLow) ? rawLow : close
    bars.push({
      time: new Date(t * 1000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: typeof quote.volume?.[i] === 'number' ? quote.volume[i] : null,
    })
  }
  return bars
}

/**
 * Daily bars for a Yahoo chart symbol (e.g. 0P0000UP8V.F).
 * Prices are in the venue currency (EUR for Finnish funds) — caller FX to USD.
 */
export async function fetchYahooDailyBars(
  yahooSymbol: string,
  fromUnix: number,
  toUnix: number
): Promise<{ bars: PriceBar[]; error?: string }> {
  if (!yahooSymbol?.trim()) {
    return { bars: [], error: 'Missing Yahoo symbol' }
  }

  const url = buildYahooHistoryUrl(yahooSymbol, fromUnix, toUnix)
  try {
    const res = await fetch(url, { cache: 'no-store', headers: YAHOO_HEADERS })
    if (!res.ok) {
      return { bars: [], error: `Yahoo history request failed (${res.status})` }
    }
    const data = await res.json()
    const bars = parseYahooDailyBars(data)
    if (bars.length === 0) {
      return { bars: [], error: 'No Yahoo history for this fund' }
    }
    return { bars }
  } catch (e) {
    console.error('fetchYahooDailyBars error:', e)
    return { bars: [], error: 'Failed to fetch fund history' }
  }
}
