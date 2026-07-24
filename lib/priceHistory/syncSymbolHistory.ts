import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fullBackfillFrom,
  gapFillFrom,
  maxHistoryDays,
  toUtcDayIso,
  utcDayStart,
} from './constants'
import { fetchFinnhubDailyCandles } from './fetchFinnhubCandles'
import { fetchBinanceDailyKlines } from './fetchBinanceKlines'
import type {
  ChartAssetType,
  PriceBar,
  PriceBarSource,
  SyncSymbolResult,
} from './types'

const RESOLUTION = '1d'
const UPSERT_CHUNK = 200

type SyncRow = {
  symbol: string
  asset_type: string
  resolution: string
  earliest_at: string | null
  latest_at: string | null
  last_synced_at: string | null
  last_error: string | null
}

type FetchBarsResult = {
  bars: PriceBar[]
  error?: string
  source: PriceBarSource
}

async function loadSyncMeta(
  supabase: SupabaseClient,
  symbol: string,
  assetType: ChartAssetType
): Promise<SyncRow | null> {
  const { data, error } = await supabase
    .from('price_bar_sync')
    .select('*')
    .eq('symbol', symbol)
    .eq('asset_type', assetType)
    .eq('resolution', RESOLUTION)
    .maybeSingle()

  if (error) {
    console.error('price_bar_sync read error:', error)
    return null
  }
  return data as SyncRow | null
}

async function countBars(
  supabase: SupabaseClient,
  symbol: string,
  assetType: ChartAssetType
): Promise<number> {
  const { count, error } = await supabase
    .from('price_bars')
    .select('id', { count: 'exact', head: true })
    .eq('symbol', symbol)
    .eq('asset_type', assetType)
    .eq('resolution', RESOLUTION)

  if (error) {
    console.error('price_bars count error:', error)
    return 0
  }
  return count ?? 0
}

async function upsertBars(
  supabase: SupabaseClient,
  symbol: string,
  assetType: ChartAssetType,
  bars: PriceBar[],
  source: PriceBarSource
): Promise<{ ok: true; n: number } | { ok: false; error: string }> {
  if (bars.length === 0) return { ok: true, n: 0 }

  const rows = bars.map((b) => ({
    symbol,
    asset_type: assetType,
    resolution: RESOLUTION,
    bar_time: utcDayStart(b.time).toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume ?? null,
    currency: 'USD',
    source,
  }))

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    const { error } = await supabase.from('price_bars').upsert(chunk, {
      onConflict: 'symbol,asset_type,resolution,bar_time',
    })
    if (error) {
      console.error('price_bars upsert error:', error)
      return { ok: false, error: 'Failed to save price history' }
    }
  }
  return { ok: true, n: rows.length }
}

async function refreshSyncMeta(
  supabase: SupabaseClient,
  symbol: string,
  assetType: ChartAssetType,
  lastError: string | null
): Promise<SyncRow | null> {
  const { data: extremes, error: extErr } = await supabase
    .from('price_bars')
    .select('bar_time')
    .eq('symbol', symbol)
    .eq('asset_type', assetType)
    .eq('resolution', RESOLUTION)
    .order('bar_time', { ascending: true })
    .limit(1)

  const { data: latestRows, error: latErr } = await supabase
    .from('price_bars')
    .select('bar_time')
    .eq('symbol', symbol)
    .eq('asset_type', assetType)
    .eq('resolution', RESOLUTION)
    .order('bar_time', { ascending: false })
    .limit(1)

  if (extErr || latErr) {
    console.error('price_bars extremes error:', extErr || latErr)
  }

  const earliest = extremes?.[0]?.bar_time ?? null
  const latest = latestRows?.[0]?.bar_time ?? null
  const now = new Date().toISOString()

  const row = {
    symbol,
    asset_type: assetType,
    resolution: RESOLUTION,
    earliest_at: earliest,
    latest_at: latest,
    last_synced_at: now,
    last_error: lastError,
  }

  const { error } = await supabase.from('price_bar_sync').upsert(row, {
    onConflict: 'symbol,asset_type,resolution',
  })
  if (error) {
    console.error('price_bar_sync upsert error:', error)
  }

  return row as SyncRow
}

function metaFromRow(
  symbol: string,
  assetType: ChartAssetType,
  row: SyncRow | null
): SyncSymbolResult['meta'] {
  return {
    symbol,
    assetType,
    earliestAt: row?.earliest_at ?? null,
    latestAt: row?.latest_at ?? null,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastError: row?.last_error ?? null,
  }
}

/**
 * Crypto chart history: Binance daily klines only (full backfill + gap fill).
 * Live portfolio quotes stay on CoinGecko (priceService) — not this path.
 */
async function fetchCryptoBars(
  symbol: string,
  fromDay: string,
  toDay: string
): Promise<FetchBarsResult> {
  const binance = await fetchBinanceDailyKlines(symbol, fromDay, toDay)
  return {
    bars: binance.bars,
    error: binance.error,
    source: 'binance',
  }
}

async function fetchBarsForRange(
  assetType: ChartAssetType,
  symbol: string,
  fromDay: string,
  toDay: string
): Promise<FetchBarsResult> {
  if (assetType === 'crypto') {
    return fetchCryptoBars(symbol, fromDay, toDay)
  }

  const fromUnix = Math.floor(utcDayStart(fromDay).getTime() / 1000)
  const toUnix = Math.floor(utcDayStart(toDay).getTime() / 1000) + 86400 - 1
  const fin = await fetchFinnhubDailyCandles(symbol, fromUnix, toUnix)
  return { bars: fin.bars, error: fin.error, source: 'finnhub' }
}

/**
 * Ensure DB has history for symbol: full backfill if empty, else gap-fill to today.
 */
export async function syncSymbolHistory(
  supabase: SupabaseClient,
  symbol: string,
  assetType: ChartAssetType,
  now = new Date()
): Promise<SyncSymbolResult> {
  const sym = symbol.toUpperCase()
  const maxDays = maxHistoryDays(assetType)
  const today = toUtcDayIso(now)

  const existingMeta = await loadSyncMeta(supabase, sym, assetType)
  const barCount = await countBars(supabase, sym, assetType)
  const hasCache = barCount > 0 && Boolean(existingMeta?.latest_at)

  if (!hasCache) {
    const fromDay = fullBackfillFrom(maxDays, now)
    const fetched = await fetchBarsForRange(assetType, sym, fromDay, today)
    if (fetched.error && fetched.bars.length === 0) {
      const metaRow = await refreshSyncMeta(supabase, sym, assetType, fetched.error)
      return {
        mode: 'full',
        barsUpserted: 0,
        historySource: fetched.source,
        error: fetched.error,
        meta: metaFromRow(sym, assetType, metaRow),
      }
    }

    const saved = await upsertBars(
      supabase,
      sym,
      assetType,
      fetched.bars,
      fetched.source
    )
    if (!saved.ok) {
      const metaRow = await refreshSyncMeta(supabase, sym, assetType, saved.error)
      return {
        mode: 'full',
        barsUpserted: 0,
        historySource: fetched.source,
        error: saved.error,
        meta: metaFromRow(sym, assetType, metaRow),
      }
    }

    const metaRow = await refreshSyncMeta(
      supabase,
      sym,
      assetType,
      fetched.error ?? null
    )
    return {
      mode: 'full',
      barsUpserted: saved.n,
      historySource: fetched.source,
      error: fetched.error,
      meta: metaFromRow(sym, assetType, metaRow),
    }
  }

  const latestAt = existingMeta!.latest_at!
  const gapFrom = gapFillFrom(latestAt, now)
  if (!gapFrom) {
    return {
      mode: 'cache_only',
      barsUpserted: 0,
      meta: metaFromRow(sym, assetType, existingMeta),
    }
  }

  const fetched = await fetchBarsForRange(assetType, sym, gapFrom, today)
  if (fetched.error && fetched.bars.length === 0) {
    const metaRow = await refreshSyncMeta(supabase, sym, assetType, fetched.error)
    return {
      mode: 'gap',
      barsUpserted: 0,
      historySource: fetched.source,
      error: fetched.error,
      meta: metaFromRow(sym, assetType, metaRow ?? existingMeta),
    }
  }

  const saved = await upsertBars(
    supabase,
    sym,
    assetType,
    fetched.bars,
    fetched.source
  )
  if (!saved.ok) {
    const metaRow = await refreshSyncMeta(supabase, sym, assetType, saved.error)
    return {
      mode: 'gap',
      barsUpserted: 0,
      historySource: fetched.source,
      error: saved.error,
      meta: metaFromRow(sym, assetType, metaRow ?? existingMeta),
    }
  }

  const metaRow = await refreshSyncMeta(
    supabase,
    sym,
    assetType,
    fetched.error ?? null
  )
  return {
    mode: 'gap',
    barsUpserted: saved.n,
    historySource: fetched.source,
    error: fetched.error,
    meta: metaFromRow(sym, assetType, metaRow),
  }
}

/** Supabase/PostgREST default max rows per request is 1000 — page past it for 3Y Max. */
const LOAD_BARS_PAGE = 1000
const LOAD_BARS_MAX_PAGES = 5

type PriceBarRow = {
  bar_time: string
  open: number | string
  high: number | string
  low: number | string
  close: number | string
  volume: number | string | null
  source: string | null
}

/**
 * Load bars from DB (USD), optional fromDay filter (inclusive).
 * Paginates with .range() so Max (~1095 days) is not silently truncated at 1000.
 * `source` is the most recent bar's provider (for footer / finalize rules).
 */
export async function loadBarsFromDb(
  supabase: SupabaseClient,
  symbol: string,
  assetType: ChartAssetType,
  fromDayInclusive: string | null
): Promise<{ bars: PriceBar[]; source: PriceBarSource | null }> {
  const rows: PriceBarRow[] = []
  const sym = symbol.toUpperCase()
  const fromIso = fromDayInclusive
    ? utcDayStart(fromDayInclusive).toISOString()
    : null

  for (let page = 0; page < LOAD_BARS_MAX_PAGES; page++) {
    const start = page * LOAD_BARS_PAGE
    const end = start + LOAD_BARS_PAGE - 1

    let q = supabase
      .from('price_bars')
      .select('bar_time, open, high, low, close, volume, source')
      .eq('symbol', sym)
      .eq('asset_type', assetType)
      .eq('resolution', RESOLUTION)
      .order('bar_time', { ascending: true })
      .range(start, end)

    if (fromIso) {
      q = q.gte('bar_time', fromIso)
    }

    const { data, error } = await q
    if (error) {
      console.error('loadBarsFromDb error:', error)
      return { bars: [], source: null }
    }

    const batch = (data ?? []) as PriceBarRow[]
    if (batch.length === 0) break
    rows.push(...batch)
    if (batch.length < LOAD_BARS_PAGE) break
  }

  const bars = rows.map((row) => ({
    time: String(row.bar_time).slice(0, 10),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume != null ? Number(row.volume) : null,
  }))

  const lastSource = rows.length > 0 ? (rows[rows.length - 1].source as string) : null
  const source: PriceBarSource | null =
    lastSource === 'binance' ||
    lastSource === 'coingecko' ||
    lastSource === 'finnhub'
      ? lastSource
      : null

  return { bars, source }
}
