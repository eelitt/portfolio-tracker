'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/user'
import { fetchYahooDailyBars } from '@/lib/priceHistory/fetchYahooBars'
import { getCryptoPricing } from '@/lib/symbols'
import {
  CRYPTO_RATE_FALLBACK,
  MIN_CRYPTO_HISTORY_YEARS,
  planningRateFromCagr,
  priceCagr,
  yearsBetween,
  type AssumptionPack,
  type AssumptionRates,
  type CoinAssumption,
} from '@/lib/projections'

const BTC_KEY = 'BTC'
const YAHOO_FROM = '2010-01-01'
const STALE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_REFRESH = 8

type Row = {
  key: string
  raw_cagr: number
  planning_rate: number
  window_start: string | null
  window_end: string | null
  source: string
  computed_at: string
}

function fallbackBtc(): AssumptionRates {
  return {
    cryptoRate: CRYPTO_RATE_FALLBACK,
    rawCagr: null,
    windowStart: null,
    windowEnd: null,
    source: 'fallback',
    computedAt: null,
  }
}

function isFresh(computedAt: string | null): boolean {
  if (!computedAt) return false
  const t = Date.parse(computedAt)
  return Number.isFinite(t) && Date.now() - t < STALE_MS
}

function yahooSymbol(ticker: string): string {
  return `${ticker.toUpperCase()}-USD`
}

function emptyCoin(symbol: string, status: CoinAssumption['status']): CoinAssumption {
  return {
    symbol,
    planningRate: null,
    rawCagr: null,
    windowStart: null,
    windowEnd: null,
    years: null,
    status,
  }
}

function coinFromRow(row: Row): CoinAssumption {
  const symbol = row.key.toUpperCase()
  const years =
    row.window_start && row.window_end
      ? yearsBetween(row.window_start, row.window_end)
      : null
  const short =
    row.source === 'short_window' ||
    (years != null && years < MIN_CRYPTO_HISTORY_YEARS)
  if (short) {
    return {
      symbol,
      planningRate: null,
      rawCagr: Number(row.raw_cagr),
      windowStart: row.window_start,
      windowEnd: row.window_end,
      years,
      status: 'short_history',
    }
  }
  if (row.source !== 'yahoo') {
    return emptyCoin(symbol, 'missing')
  }
  return {
    symbol,
    planningRate: Number(row.planning_rate),
    rawCagr: Number(row.raw_cagr),
    windowStart: row.window_start,
    windowEnd: row.window_end,
    years,
    status: 'used',
  }
}

function btcFromCoin(coin: CoinAssumption): AssumptionRates {
  if (coin.status === 'used' && coin.planningRate != null) {
    return {
      cryptoRate: coin.planningRate,
      rawCagr: coin.rawCagr,
      windowStart: coin.windowStart,
      windowEnd: coin.windowEnd,
      source: 'yahoo',
      computedAt: null,
    }
  }
  return fallbackBtc()
}

async function readRows(keys: string[]): Promise<Map<string, Row>> {
  const map = new Map<string, Row>()
  if (keys.length === 0) return map
  const lookup = [...new Set([...keys, ...keys.map((k) => k.toLowerCase())])]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('market_return_assumptions')
    .select('key, raw_cagr, planning_rate, window_start, window_end, source, computed_at')
    .in('key', lookup)
  if (error) {
    console.error('market_return_assumptions read error:', error)
    return map
  }
  for (const r of data ?? []) {
    map.set(String(r.key).toUpperCase(), r as Row)
  }
  return map
}

async function persistRow(row: {
  key: string
  window_start: string
  window_end: string
  raw_cagr: number
  planning_rate: number
  source: 'yahoo' | 'short_window'
}) {
  try {
    const admin = createServiceClient()
    const { error } = await admin.from('market_return_assumptions').upsert({
      key: row.key,
      window_start: row.window_start,
      window_end: row.window_end,
      raw_cagr: row.raw_cagr,
      planning_rate: row.planning_rate,
      source: row.source,
      computed_at: new Date().toISOString(),
    })
    if (error) console.error('market_return_assumptions upsert error:', error)
  } catch (e) {
    console.error('market_return_assumptions persist skipped:', e)
  }
}

async function refreshTicker(ticker: string): Promise<CoinAssumption> {
  const key = ticker.toUpperCase()
  const fromUnix = Math.floor(Date.parse(`${YAHOO_FROM}T00:00:00Z`) / 1000)
  const toUnix = Math.floor(Date.now() / 1000)
  const fetched = await fetchYahooDailyBars(yahooSymbol(key), fromUnix, toUnix)
  if (fetched.error || fetched.bars.length < 2) {
    return emptyCoin(key, 'missing')
  }

  const first = fetched.bars[0]
  const last = fetched.bars[fetched.bars.length - 1]
  const years = yearsBetween(first.time, last.time)
  const raw = priceCagr(first.close, last.close, years)
  if (raw == null || !(years > 0)) {
    return emptyCoin(key, 'missing')
  }

  const windowStart = first.time.slice(0, 10)
  const windowEnd = last.time.slice(0, 10)
  const short = years < MIN_CRYPTO_HISTORY_YEARS
  const planning = short ? 0 : planningRateFromCagr(raw)
  await persistRow({
    key,
    window_start: windowStart,
    window_end: windowEnd,
    raw_cagr: raw,
    planning_rate: planning,
    source: short ? 'short_window' : 'yahoo',
  })
  return {
    symbol: key,
    planningRate: short ? null : planning,
    rawCagr: raw,
    windowStart,
    windowEnd,
    years,
    status: short ? 'short_history' : 'used',
  }
}

function wantedTickers(symbols: string[] | undefined): string[] {
  const set = new Set<string>([BTC_KEY])
  for (const s of symbols ?? []) {
    const t = s.trim().toUpperCase()
    if (!t || getCryptoPricing(t).kind === 'stable') continue
    if (getCryptoPricing(t).kind === 'none') continue
    set.add(t)
  }
  return [...set]
}

function packFromCoins(coins: CoinAssumption[]): AssumptionPack {
  const btc = coins.find((c) => c.symbol === BTC_KEY)
  const btcRates = btc ? btcFromCoin(btc) : fallbackBtc()
  return {
    fallbackCrypto: btcRates.cryptoRate,
    btc: btcRates,
    coins,
  }
}

/**
 * Shared planning rates for BTC + requested coins.
 * refresh=false is cache-only (dashboard GET). refresh=true may Yahoo-fetch
 * stale/missing keys (capped). Never throws.
 */
export async function getAssumptionRates(opts?: {
  refresh?: boolean
  symbols?: string[]
}): Promise<AssumptionPack> {
  const empty: AssumptionPack = {
    fallbackCrypto: CRYPTO_RATE_FALLBACK,
    btc: fallbackBtc(),
    coins: [emptyCoin(BTC_KEY, 'missing')],
  }

  const user = await getCurrentUser()
  if (!user) return empty

  const keys = wantedTickers(opts?.symbols)
  const refresh = opts?.refresh === true
  const rows = await readRows(keys)

  const coins: CoinAssumption[] = []
  const toRefresh: string[] = []
  for (const key of keys) {
    const row = rows.get(key)
    if (row && isFresh(row.computed_at)) {
      coins.push(coinFromRow(row))
      continue
    }
    if (refresh) toRefresh.push(key)
    else if (row) coins.push(coinFromRow(row))
    else coins.push(emptyCoin(key, 'missing'))
  }

  if (toRefresh.length > 0) {
    const batch = toRefresh.slice(0, MAX_REFRESH)
    const fetched = await Promise.all(batch.map((k) => refreshTicker(k)))
    const byKey = new Map(fetched.map((c) => [c.symbol, c]))
    for (const key of keys) {
      const i = coins.findIndex((c) => c.symbol === key)
      const next = byKey.get(key)
      if (!next) continue
      if (i >= 0) coins[i] = next
      else coins.push(next)
    }
  }

  if (!coins.some((c) => c.symbol === BTC_KEY)) {
    coins.unshift(emptyCoin(BTC_KEY, 'missing'))
  }

  return packFromCoins(coins)
}
