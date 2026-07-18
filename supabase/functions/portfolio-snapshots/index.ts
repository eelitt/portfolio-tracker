/**
 * Daily portfolio snapshots for ACTIVE users only (tx activity in last ACTIVE_DAYS).
 * Concurrency-capped. Totals stored in USD. One upsert per user per UTC date.
 *
 * Mirror of weighted-average holdings in lib/calculatePortfolio.ts — keep in sync.
 * Crypto ids: keep in sync with lib/symbols/cryptos.json.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the function env (injected by Supabase).
 * Secrets: FINNHUB_API_KEY, optional SNAPSHOT_CONCURRENCY (default 5), ACTIVE_DAYS (90)
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const CONCURRENCY = Number(Deno.env.get('SNAPSHOT_CONCURRENCY') ?? '5')
const ACTIVE_DAYS = Number(Deno.env.get('ACTIVE_DAYS') ?? '90')

/** Keep in sync with lib/symbols/cryptos.json */
const CRYPTO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  USDC: 'usd-coin',
  XRP: 'ripple',
  SOL: 'solana',
  TRX: 'tron',
  FIGR_HELOC: 'figure-heloc',
  HYPE: 'hyperliquid',
  DOGE: 'dogecoin',
  USDS: 'usds',
  RAIN: 'rain',
  LEO: 'leo-token',
  ZEC: 'zcash',
  WBT: 'whitebit',
  ADA: 'cardano',
  XLM: 'stellar',
  XMR: 'monero',
  LINK: 'chainlink',
  CC: 'canton-network',
}

type Tx = {
  symbol: string
  asset_type: 'stock' | 'etf' | 'crypto' | 'cash'
  action: 'buy' | 'sell' | 'inflow' | 'outflow'
  quantity: number
  unit_price: number
  executed_at: string
  currency?: string | null
}

type Holding = {
  symbol: string
  asset_type: Tx['asset_type']
  quantity: number
  totalCost: number
  currency: 'USD' | 'EUR'
}

type SnapshotResult = {
  userId: string
  ok: boolean
  error?: string
  partial?: boolean
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

/** Weighted average holdings — mirror of lib/calculatePortfolio.ts (simplified). */
function calculateHoldings(transactions: Tx[]): Holding[] {
  const normalized = transactions.map((tx) => ({
    ...tx,
    quantity: Number(tx.quantity),
    unit_price: Number(tx.unit_price),
  }))

  const grouped = new Map<string, Tx[]>()
  for (const tx of normalized) {
    if (!grouped.has(tx.symbol)) grouped.set(tx.symbol, [])
    grouped.get(tx.symbol)!.push(tx)
  }

  const holdings: Holding[] = []
  for (const [, txs] of grouped) {
    const sorted = [...txs].sort(
      (a, b) =>
        new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime(),
    )
    let quantity = 0
    let totalCost = 0

    for (const tx of sorted) {
      if (tx.action === 'buy' || tx.action === 'inflow') {
        totalCost += tx.quantity * tx.unit_price
        quantity += tx.quantity
      } else if (tx.action === 'sell' || tx.action === 'outflow') {
        if (quantity > 0) {
          const sellQ = Math.min(tx.quantity, quantity)
          const avgCost = totalCost / quantity
          quantity -= sellQ
          totalCost -= sellQ * avgCost
          if (quantity < 0) quantity = 0
          if (totalCost < 0) totalCost = 0
        }
      }
    }

    if (quantity > 0) {
      const first = sorted[0]
      const isCash = first.asset_type === 'cash'
      const finalQty = isCash
        ? Number(quantity.toFixed(2))
        : Number(quantity.toFixed(8))
      if (finalQty > 0) {
        const finalCost = isCash
          ? Number(totalCost.toFixed(2))
          : Number(totalCost.toFixed(8))
        holdings.push({
          symbol: first.symbol,
          asset_type: first.asset_type,
          quantity: finalQty,
          totalCost: finalCost,
          currency: first.currency === 'EUR' ? 'EUR' : 'USD',
        })
      }
    }
  }
  return holdings
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

function toUsd(amount: number, currency: 'USD' | 'EUR', usdToEur: number): number {
  if (currency === 'USD') return amount
  return amount / usdToEur
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

async function fetchCryptoPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const idToSym = new Map<string, string>()
  for (const s of symbols) {
    const id = CRYPTO_IDS[s.toUpperCase()]
    if (id) idToSym.set(id, s)
  }
  if (idToSym.size === 0) return out

  const ids = [...idToSym.keys()].join(',')
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`,
  )
  if (!res.ok) return out
  const data = await res.json()
  for (const [id, sym] of idToSym) {
    const usd = data?.[id]?.usd
    if (typeof usd === 'number' && usd > 0) out[sym] = usd
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
): Promise<SnapshotResult> {
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select(
      'symbol, asset_type, action, quantity, unit_price, executed_at, currency',
    )
    .eq('user_id', userId)

  if (txErr) return { userId, ok: false, error: txErr.message }
  if (!txs?.length) {
    return { userId, ok: true, error: 'skipped_no_txs' }
  }

  const holdings = calculateHoldings(txs as Tx[])
  if (holdings.length === 0) {
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

  const assets = holdings.filter((h) => h.asset_type !== 'cash')
  const cryptos = assets
    .filter((h) => h.asset_type === 'crypto')
    .map((h) => h.symbol)
  const stocks = assets.filter(
    (h) => h.asset_type === 'stock' || h.asset_type === 'etf',
  )

  const cryptoPrices = await fetchCryptoPrices(cryptos)
  const stockPrices: Record<string, number> = {}
  if (finnhubKey) {
    await mapPool(stocks, 3, async (h) => {
      const p = await fetchStockPrice(h.symbol, finnhubKey)
      if (p != null) stockPrices[h.symbol] = p
    })
  }

  let totalMvUsd = 0
  let totalCostUsd = 0
  let pricedAssets = 0
  const assetCount = assets.length

  for (const h of holdings) {
    const costUsd = toUsd(h.totalCost, h.currency, usdToEur)
    totalCostUsd += costUsd

    if (h.asset_type === 'cash') {
      const faceUsd = toUsd(h.quantity, h.currency, usdToEur)
      totalMvUsd += faceUsd
      continue
    }

    let priceUsd: number | undefined
    if (h.asset_type === 'crypto') priceUsd = cryptoPrices[h.symbol]
    else priceUsd = stockPrices[h.symbol]

    if (priceUsd != null && priceUsd > 0) {
      totalMvUsd += h.quantity * priceUsd
      pricedAssets++
    }
  }

  const isPartial = pricedAssets < assetCount
  const totalUnrealized = totalMvUsd - totalCostUsd

  const { error: upErr } = await supabase.from('portfolio_snapshots').upsert(
    {
      user_id: userId,
      snapshot_date: snapshotDate,
      total_market_value: Number(totalMvUsd.toFixed(4)),
      total_cost_basis: Number(totalCostUsd.toFixed(4)),
      total_unrealized_pnl: Number(totalUnrealized.toFixed(4)),
      currency: 'USD',
      holdings_count: holdings.length,
      priced_asset_count: pricedAssets,
      is_partial: isPartial,
      meta: {
        asset_count: assetCount,
        source: 'edge_portfolio_snapshots',
      },
    },
    { onConflict: 'user_id,snapshot_date' },
  )

  if (upErr) return { userId, ok: false, error: upErr.message }
  return { userId, ok: true, partial: isPartial }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!serviceKey) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  if (!supabaseUrl) return json({ error: 'Missing SUPABASE_URL' }, 500)

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
  const userIds: string[] = [...userIdSet]

  const results = await mapPool(userIds, CONCURRENCY, (userId) =>
    snapshotUser(supabase, userId, snapshotDate, finnhubKey, usdToEur),
  )

  const ok = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)

  return json({
    snapshot_date: snapshotDate,
    active_users: userIds.length,
    concurrency: CONCURRENCY,
    active_days: ACTIVE_DAYS,
    ok,
    failed_count: failed.length,
    failed: failed.slice(0, 20),
  })
})
