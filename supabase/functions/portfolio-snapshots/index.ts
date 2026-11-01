/**
 * Daily portfolio + per-holding snapshots for ACTIVE users only
 * (tx activity in last ACTIVE_DAYS). Concurrency-capped.
 * Totals → portfolio_snapshots; open holdings → holding_snapshots (USD).
 * One upsert pass per user per UTC date (same price fetch for both).
 *
 * Mirror of weighted-average holdings in lib/calculatePortfolio.ts — keep in sync.
 * Crypto spot: Binance USDT last price. An open future uses the USD-M mark, not that ticker.
 * Stocks/ETFs: Finnhub.
 * Book math: ./book.ts. Older snapshot rows are not rewritten.
 *
 * Invoke with:
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Secrets: FINNHUB_API_KEY, optional SNAPSHOT_CONCURRENCY (default 5), ACTIVE_DAYS (90),
 * optional BINANCE_API_BASE (default https://api.binance.com)
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  buildUserSnapshot,
  snapshotFetchPlan,
  type SnapshotTx,
} from './book.ts'

const CONCURRENCY = Number(Deno.env.get('SNAPSHOT_CONCURRENCY') ?? '5')
const ACTIVE_DAYS = Number(Deno.env.get('ACTIVE_DAYS') ?? '90')

const BINANCE_API_BASE = (
  Deno.env.get('BINANCE_API_BASE') ?? 'https://api.binance.com'
).replace(/\/$/, '')
const BINANCE_FAPI_BASE = (
  Deno.env.get('BINANCE_FAPI_BASE') ?? 'https://fapi.binance.com'
).replace(/\/$/, '')

/** Face-value stables — keep in sync with lib/symbols/cryptos.json + getCryptoPricing */
const CRYPTO_STABLES = new Set([
  'USDT',
  'USDC',
  'USDS',
  'BUSD',
  'DAI',
  'TUSD',
  'FDUSD',
  'USDE',
  'USD',
])

/**
 * Portfolio ticker → Binance USDT pair. Keep in sync with cryptos.json binance_symbol.
 * Unknown non-stable tickers fall back to `${SYM}USDT` (same as app getCryptoPricing).
 */
const CRYPTO_BINANCE_PAIRS: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  BNB: 'BNBUSDT',
  XRP: 'XRPUSDT',
  SOL: 'SOLUSDT',
  TRX: 'TRXUSDT',
  DOGE: 'DOGEUSDT',
  ZEC: 'ZECUSDT',
  ADA: 'ADAUSDT',
  XLM: 'XLMUSDT',
  XMR: 'XMRUSDT',
  LINK: 'LINKUSDT',
  HYPE: 'HYPEUSDT',
  AAVE: 'AAVEUSDT',
  TAO: 'TAOUSDT',
}

function binancePairForTicker(ticker: string): string | null {
  const upper = ticker.trim().toUpperCase()
  if (!upper || CRYPTO_STABLES.has(upper)) return null
  if (CRYPTO_BINANCE_PAIRS[upper]) return CRYPTO_BINANCE_PAIRS[upper]
  if (upper.endsWith('USDT') && upper.length > 4) return upper
  return `${upper}USDT`
}

type SnapshotResult = {
  userId: string
  ok: boolean
  error?: string
  partial?: boolean
  preview?: unknown
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getUsdToEurRate(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR')
    if (!res.ok) return 0.92
    const data = await res.json()
    const rate = data?.rates?.EUR
    return typeof rate === 'number' && rate > 0 ? rate : 0.92
  } catch {
    return 0.92
  }
}

/** Catalog pair, rejecting a 1000-unit contract. Spot last price is not a future mark. */
function usdMPair(ticker: string): string | null {
  const pair = binancePairForTicker(ticker)
  if (!pair) return null
  const upper = pair.toUpperCase()
  if (!upper.endsWith('USDT') || upper.startsWith('1000')) return null
  return upper
}

async function fetchUsdMMark(symbol: string): Promise<number | null> {
  const pair = usdMPair(symbol)
  if (!pair) return null
  const res = await fetch(
    `${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(pair)}`,
  )
  if (!res.ok) return null
  const data = await res.json()
  const mark = Number(data?.markPrice)
  return Number.isFinite(mark) && mark > 0 ? mark : null
}

async function fetchStockPrice(
  symbol: string,
  apiKey: string,
): Promise<number | null> {
  const url =
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const c = data?.c
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : null
}

/**
 * Batch-fetch crypto last prices from Binance 24hr ticker (app-aligned).
 * Stables resolve to 1 with no network call.
 */
async function fetchCryptoPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (symbols.length === 0) return out

  /** Binance pair → portfolio ticker(s) */
  const pairToSym = new Map<string, string>()

  for (const raw of symbols) {
    const sym = raw.trim().toUpperCase()
    if (!sym) continue
    if (CRYPTO_STABLES.has(sym)) {
      out[raw] = 1
      out[sym] = 1
      continue
    }
    const pair = binancePairForTicker(sym)
    if (!pair) continue
    // First ticker wins if two map to same pair (unusual)
    if (!pairToSym.has(pair)) pairToSym.set(pair, raw)
  }

  if (pairToSym.size === 0) return out

  const pairs = [...pairToSym.keys()]
  const symbolsParam = encodeURIComponent(JSON.stringify(pairs))
  const res = await fetch(
    `${BINANCE_API_BASE}/api/v3/ticker/24hr?symbols=${symbolsParam}`,
  )
  if (!res.ok) return out

  const data = await res.json()
  const rows = Array.isArray(data) ? data : data ? [data] : []
  for (const row of rows) {
    const pair =
      typeof row?.symbol === 'string' ? row.symbol.trim().toUpperCase() : ''
    const portfolioSym = pairToSym.get(pair)
    if (!portfolioSym) continue
    const last = Number(row?.lastPrice)
    if (Number.isFinite(last) && last > 0) {
      out[portfolioSym] = last
      out[portfolioSym.toUpperCase()] = last
    }
  }
  return out
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  const n = Math.min(limit, Math.max(1, items.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

async function snapshotUser(
  supabase: SupabaseClient,
  userId: string,
  snapshotDate: string,
  finnhubKey: string | undefined,
  usdToEur: number,
  dryRun: boolean,
): Promise<SnapshotResult> {
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select(
      'id, symbol, asset_type, action, position_side, quantity, unit_price, amount, executed_at, created_at, currency',
    )
    .eq('user_id', userId)

  if (txErr) return { userId, ok: false, error: txErr.message }
  if (!txs?.length) {
    return { userId, ok: true, error: 'skipped_no_txs' }
  }

  const rows = txs as SnapshotTx[]
  const plan = snapshotFetchPlan(rows)
  const cryptoPrices = await fetchCryptoPrices(plan.cryptos)
  const stockSymbols: string[] = plan.stocks
  const perpSymbols: string[] = plan.perpSymbols
  const stockPrices: Record<string, number> = {}
  if (finnhubKey) {
    await mapPool<string, void>(stockSymbols, 3, async (symbol) => {
      const p = await fetchStockPrice(symbol, finnhubKey)
      if (p != null) stockPrices[symbol] = p
    })
  }
  const marks: Record<string, number | null> = {}
  await mapPool<string, void>(perpSymbols, 3, async (symbol) => {
    marks[symbol] = await fetchUsdMMark(symbol)
  })

  const built = buildUserSnapshot({
    userId,
    snapshotDate,
    txs: rows,
    cryptoPrices,
    stockPrices,
    usdToEur,
    marks,
  })

  if (built.empty) {
    if (dryRun) {
      return {
        userId,
        ok: true,
        preview: { empty: true, total_market_value: 0, holding_rows: [] },
      }
    }
    const { error: upErr } = await supabase.from('portfolio_snapshots').upsert(
      {
        user_id: userId,
        snapshot_date: snapshotDate,
        total_market_value: 0,
        total_cost_basis: 0,
        total_unrealized_pnl: 0,
        currency: 'USD',
        holdings_count: 0,
        priced_asset_count: 0,
        is_partial: false,
        meta: { reason: 'flat_empty' },
      },
      { onConflict: 'user_id,snapshot_date' },
    )
    if (upErr) return { userId, ok: false, error: upErr.message }
    return { userId, ok: true }
  }

  if (dryRun) {
    return {
      userId,
      ok: true,
      partial: built.isPartial,
      preview: {
        total_market_value: built.totalMarketValue,
        total_cost_basis: built.totalCostBasis,
        total_unrealized_pnl: built.totalUnrealizedPnl,
        is_partial: built.isPartial,
        holding_rows: built.holdingRows,
      },
    }
  }

  if (built.holdingRows.length > 0) {
    const { error: holdErr } = await supabase
      .from('holding_snapshots')
      .upsert(built.holdingRows, {
        onConflict: 'user_id,snapshot_date,symbol,asset_type,position_side',
      })
    if (holdErr) return { userId, ok: false, error: holdErr.message }
  }

  const { error: upErr } = await supabase.from('portfolio_snapshots').upsert(
    {
      user_id: userId,
      snapshot_date: snapshotDate,
      total_market_value: built.totalMarketValue,
      total_cost_basis: built.totalCostBasis,
      total_unrealized_pnl: built.totalUnrealizedPnl,
      currency: 'USD',
      holdings_count: built.holdingsCount,
      priced_asset_count: built.pricedAssetCount,
      is_partial: built.isPartial,
      meta: {
        asset_count: built.assetCount,
        holding_rows: built.holdingRows.length,
        source: 'edge_portfolio_snapshots',
        ...(built.perpRows > 0 ? { perp_rows: built.perpRows } : {}),
      },
    },
    { onConflict: 'user_id,snapshot_date' },
  )

  if (upErr) return { userId, ok: false, error: upErr.message }
  return { userId, ok: true, partial: built.isPartial }
}

Deno.serve(async (req) => {

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey) {
    return json({ error: 'Unauthorized' }, 401)
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  if (!supabaseUrl) return json({ error: 'Missing SUPABASE_URL' }, 500)

  let dryRun = new URL(req.url).searchParams.get('dry_run') === '1'
  let onlyUser: string | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body?.dryRun === true) dryRun = true
      if (typeof body?.userId === 'string' && body.userId.length > 0) {
        onlyUser = body.userId
      }
    } catch {
      // GET, or a POST with no JSON body.
    }
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const finnhubKey = Deno.env.get('FINNHUB_API_KEY')
  const snapshotDate = utcToday()
  const usdToEur = await getUsdToEurRate()

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - ACTIVE_DAYS)
  const sinceIso = since.toISOString()

  const { data: activeRows, error: activeErr } = await supabase
    .from('transactions')
    .select('user_id')
    .or(`executed_at.gte.${sinceIso},created_at.gte.${sinceIso}`)

  if (activeErr) return json({ error: activeErr.message }, 500)

  // Untyped Supabase client types user_id as unknown — build Set<string> explicitly
  const userIdSet = new Set<string>()
  for (const row of activeRows ?? []) {
    const id = row.user_id
    if (typeof id === 'string' && id.length > 0) userIdSet.add(id)
  }
  const userIds: string[] = onlyUser ? [onlyUser] : [...userIdSet]

  const results = await mapPool(userIds, CONCURRENCY, (userId) =>
    snapshotUser(supabase, userId, snapshotDate, finnhubKey, usdToEur, dryRun),
  )

  const ok = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  return json({
    snapshot_date: snapshotDate,
    dry_run: dryRun,
    active_users: userIds.length,
    concurrency: CONCURRENCY,
    active_days: ACTIVE_DAYS,
    ok,
    failed_count: failed.length,
    failed: failed.slice(0, 20),
    ...(dryRun ? { results } : {}),
  })
})
