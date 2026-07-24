import type { PriceBar } from './types'

type FinnhubCandleResponse = {
  s?: string
  t?: number[]
  o?: number[]
  h?: number[]
  l?: number[]
  c?: number[]
  v?: number[]
}

function isValidPx(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/**
 * Daily OHLC from Finnhub for stocks/ETFs.
 * from/to are unix seconds (inclusive range per Finnhub).
 */
export async function fetchFinnhubDailyCandles(
  symbol: string,
  fromUnix: number,
  toUnix: number
): Promise<{ bars: PriceBar[]; error?: string }> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    return { bars: [], error: 'Missing FINNHUB_API_KEY' }
  }

  const url =
    `https://finnhub.io/api/v1/stock/candle` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&resolution=D&from=${fromUnix}&to=${toUnix}&token=${apiKey}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (res.status === 429) {
      return { bars: [], error: 'Rate limited by Finnhub. Try again shortly.' }
    }
    if (!res.ok) {
      return { bars: [], error: `Finnhub candle request failed (${res.status})` }
    }

    const data = (await res.json()) as FinnhubCandleResponse
    if (data.s === 'no_data' || !data.t?.length) {
      return { bars: [] }
    }
    if (data.s && data.s !== 'ok') {
      return { bars: [], error: `Finnhub returned status: ${data.s}` }
    }

    const bars: PriceBar[] = []
    for (let i = 0; i < data.t.length; i++) {
      const o = data.o?.[i]
      const h = data.h?.[i]
      const l = data.l?.[i]
      const c = data.c?.[i]
      if (!isValidPx(o) || !isValidPx(h) || !isValidPx(l) || !isValidPx(c)) continue
      const ts = data.t[i]
      if (typeof ts !== 'number' || !Number.isFinite(ts)) continue
      const day = new Date(ts * 1000)
      const time = day.toISOString().slice(0, 10)
      bars.push({
        time,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: typeof data.v?.[i] === 'number' ? data.v[i] : null,
      })
    }

    return { bars }
  } catch (e) {
    console.error('fetchFinnhubDailyCandles error:', e)
    return { bars: [], error: 'Failed to fetch stock history' }
  }
}
