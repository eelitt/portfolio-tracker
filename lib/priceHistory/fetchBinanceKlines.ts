import { getBinanceSpotSymbol } from './binanceSymbol'
import { utcDayStart } from './constants'
import type { PriceBar } from './types'

const DEFAULT_BASE = 'https://api.binance.com'
const KLINE_LIMIT = 1000

type BinanceKline = [
  number, // open time ms
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  ...unknown[],
]

function binanceBaseUrl(): string {
  const raw =
    process.env.BINANCE_API_BASE ||
    process.env.NEXT_PUBLIC_BINANCE_API_BASE ||
    DEFAULT_BASE
  return raw.replace(/\/$/, '')
}

function parsePx(s: unknown): number | null {
  const n = typeof s === 'string' ? Number(s) : typeof s === 'number' ? s : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Pure parser for unit tests. */
export function parseBinanceKlines(raw: unknown): PriceBar[] {
  if (!Array.isArray(raw)) return []
  const bars: PriceBar[] = []
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue
    const openTime = row[0]
    const o = parsePx(row[1])
    const h = parsePx(row[2])
    const l = parsePx(row[3])
    const c = parsePx(row[4])
    const vol = parsePx(row[5])
    if (typeof openTime !== 'number' || !Number.isFinite(openTime)) continue
    if (o == null || h == null || l == null || c == null) continue
    bars.push({
      time: new Date(openTime).toISOString().slice(0, 10),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: vol,
    })
  }
  const byDay = new Map<string, PriceBar>()
  for (const b of bars) byDay.set(b.time, b)
  return [...byDay.values()].sort((a, b) => a.time.localeCompare(b.time))
}

function dedupeBars(bars: PriceBar[]): PriceBar[] {
  const byDay = new Map<string, PriceBar>()
  for (const b of bars) byDay.set(b.time, b)
  return [...byDay.values()].sort((a, b) => a.time.localeCompare(b.time))
}

/**
 * Daily OHLC from Binance public klines (no API key).
 * Paginates until [fromDay, toDay] is covered or exchange has no more data.
 */
export async function fetchBinanceDailyKlines(
  symbol: string,
  fromDay: string,
  toDay: string
): Promise<{ bars: PriceBar[]; error?: string; pair?: string }> {
  const pair = getBinanceSpotSymbol(symbol)
  if (!pair) {
    return {
      bars: [],
      error: `No Binance USDT pair for ${symbol}`,
    }
  }

  const startMs = utcDayStart(fromDay).getTime()
  const endMs = utcDayStart(toDay).getTime() + 86400_000 - 1
  if (startMs > endMs) {
    return { bars: [], pair }
  }

  const all: PriceBar[] = []
  let cursor = startMs
  const base = binanceBaseUrl()

  try {
    // 3Y daily ~1095 bars → 2 pages; allow a few extra
    for (let page = 0; page < 8 && cursor <= endMs; page++) {
      const url =
        `${base}/api/v3/klines` +
        `?symbol=${encodeURIComponent(pair)}` +
        `&interval=1d` +
        `&startTime=${cursor}` +
        `&endTime=${endMs}` +
        `&limit=${KLINE_LIMIT}`

      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 429) {
        return {
          bars: dedupeBars(all),
          pair,
          error:
            all.length > 0
              ? 'Rate limited by Binance (partial history).'
              : 'Rate limited by Binance. Try again shortly.',
        }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 400 || body.includes('Invalid symbol')) {
          return {
            bars: [],
            pair,
            error: `Binance has no spot market for ${pair}`,
          }
        }
        return {
          bars: dedupeBars(all),
          pair,
          error:
            all.length > 0
              ? `Binance klines failed (${res.status}); partial history kept.`
              : `Binance klines failed (${res.status})`,
        }
      }

      const json = (await res.json()) as BinanceKline[]
      if (!Array.isArray(json) || json.length === 0) break

      all.push(...parseBinanceKlines(json))

      const lastOpen = json[json.length - 1]?.[0]
      if (typeof lastOpen !== 'number') break
      cursor = lastOpen + 1
      if (json.length < KLINE_LIMIT) break
    }

    return { bars: dedupeBars(all), pair }
  } catch (e) {
    console.error('fetchBinanceDailyKlines error:', e)
    return {
      bars: dedupeBars(all),
      pair,
      error:
        all.length > 0
          ? 'Failed to fetch Binance history (partial kept).'
          : 'Failed to fetch Binance history',
    }
  }
}
