/**
 * Binance USD-M mark for open futures. Not the spot ticker and not the
 * futures last-trade price. previousMark is this mark 24 hours earlier.
 */

import { getCryptoPricing } from '@/lib/symbols'
import { usableUsdMPair, type PerpMark } from '@/lib/perps'

const DEFAULT_FAPI = 'https://fapi.binance.com'
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS
const MAX_KLINE_LAG_MS = 5 * MINUTE_MS

const PRICE_CACHE = { next: { revalidate: 60, tags: ['prices'] as string[] } }
const PRICE_NO_STORE = { cache: 'no-store' as const }

export type UsdMMarkFetchOptions = {
  forceFresh?: boolean
}

export function binanceFapiBase(): string {
  const raw = process.env.BINANCE_FAPI_BASE || DEFAULT_FAPI
  return raw.replace(/\/$/, '')
}

/** Start of the 1m bucket 24 hours before now. */
export function usdMPreviousMarkStart(nowMs: number): number {
  const target = nowMs - DAY_MS
  return target - (target % MINUTE_MS)
}

export function buildUsdMPremiumIndexUrl(pair: string): string {
  return `${binanceFapiBase()}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(pair)}`
}

export function buildUsdMMarkKlineUrl(pair: string, startTime: number): string {
  const params = new URLSearchParams({
    symbol: pair,
    interval: '1m',
    startTime: String(startTime),
    limit: '1',
  })
  return `${binanceFapiBase()}/fapi/v1/markPriceKlines?${params}`
}

function parsePx(s: unknown): number | null {
  const n = typeof s === 'string' ? Number(s) : typeof s === 'number' ? s : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Current mark from premiumIndex.markPrice. Last-trade fields are ignored. */
export function parseUsdMPremiumIndex(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  return parsePx((raw as { markPrice?: unknown }).markPrice)
}

/**
 * Open of the 1m mark-price kline at startTime.
 * A candle that opens much later is not the mark from 24 hours ago.
 */
export function parseUsdMMarkKlineOpen(raw: unknown, startTime: number): number | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const row = raw[0]
  if (!Array.isArray(row) || row.length < 2) return null
  const openTime = row[0]
  if (typeof openTime !== 'number' || !Number.isFinite(openTime)) return null
  if (openTime > startTime + MAX_KLINE_LAG_MS) return null
  return parsePx(row[1])
}

function pairForCatalogSymbol(symbol: string): string | null {
  const pricing = getCryptoPricing(symbol)
  if (pricing.kind !== 'binance') return null
  return usableUsdMPair(pricing.pair)
}

function fetchInit(forceFresh?: boolean): RequestInit {
  return forceFresh ? PRICE_NO_STORE : PRICE_CACHE
}

async function fetchJson(
  url: string,
  options: UsdMMarkFetchOptions
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const res = await fetch(url, fetchInit(options.forceFresh))
    if (!res.ok) return { ok: false }
    return { ok: true, data: await res.json() }
  } catch (error) {
    console.error('USD-M mark fetch error:', error)
    return { ok: false }
  }
}

/** Marks for open futures only. A missing one-unit pair is a missing mark. */
export async function getUsdMMarks(
  symbols: string[],
  options: UsdMMarkFetchOptions = {}
): Promise<Record<string, PerpMark>> {
  const unique = [
    ...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ]
  const out: Record<string, PerpMark> = {}
  if (unique.length === 0) return out

  const start = usdMPreviousMarkStart(Date.now())
  await Promise.all(
    unique.map(async (symbol) => {
      const pair = pairForCatalogSymbol(symbol)
      if (!pair) {
        out[symbol] = { mark: null, previousMark: null }
        return
      }
      const [markRes, prevRes] = await Promise.all([
        fetchJson(buildUsdMPremiumIndexUrl(pair), options),
        fetchJson(buildUsdMMarkKlineUrl(pair, start), options),
      ])
      out[symbol] = {
        mark: markRes.ok ? parseUsdMPremiumIndex(markRes.data) : null,
        previousMark: prevRes.ok
          ? parseUsdMMarkKlineOpen(prevRes.data, start)
          : null,
      }
    })
  )
  return out
}
