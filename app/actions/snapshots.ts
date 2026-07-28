'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/user'
import { convertAmount, getUsdToEurRate } from '@/lib/currency'
import type { SnapshotPoint } from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'

export type GetPortfolioSnapshotsResult = {
  data?: SnapshotPoint[]
  error?: string
}

export type HoldingSnapshotQuery = {
  symbol: string
  assetType: 'stock' | 'etf' | 'crypto' | 'cash'
}

function normalizeSnapshotDate(dateRaw: unknown): string {
  if (typeof dateRaw === 'string') return dateRaw.slice(0, 10)
  if (dateRaw) return String(dateRaw).slice(0, 10)
  return ''
}

function toChartPoints(
  rows: {
    snapshot_date: unknown
    market_value?: unknown
    total_market_value?: unknown
    cost_basis?: unknown
    total_cost_basis?: unknown
    is_partial?: unknown
  }[],
  preferred: PreferredCurrency,
  usdToEurRate: number,
  valueKey: 'total' | 'holding'
): SnapshotPoint[] {
  const points: SnapshotPoint[] = []
  for (const row of rows) {
    const date = normalizeSnapshotDate(row.snapshot_date)
    if (!date) continue

    const mvUsd = Number(
      valueKey === 'total' ? row.total_market_value : row.market_value
    )
    const costUsd = Number(
      valueKey === 'total' ? row.total_cost_basis : row.cost_basis
    )
    if (!Number.isFinite(mvUsd)) continue

    const marketValue = convertAmount(mvUsd, preferred, usdToEurRate)
    const costBasis = Number.isFinite(costUsd)
      ? convertAmount(costUsd, preferred, usdToEurRate)
      : 0

    points.push({
      date,
      marketValue,
      costBasis,
      isPartial: Boolean(row.is_partial),
    })
  }
  return points
}

/**
 * Load the current user's portfolio_snapshots (RLS), convert USD totals
 * to preferred currency for chart display.
 */
export async function getPortfolioSnapshots(): Promise<GetPortfolioSnapshotsResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Not authenticated' }
    }

    const profile = await getCurrentUserProfile()
    const preferred = profile?.preferredCurrency || 'USD'
    const usdToEurRate = await getUsdToEurRate()

    const { data: rows, error } = await supabase
      .from('portfolio_snapshots')
      .select(
        'snapshot_date, total_market_value, total_cost_basis, is_partial, currency'
      )
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true })

    if (error) {
      console.error('portfolio_snapshots fetch error:', error)
      return { error: 'Failed to load portfolio history.' }
    }

    return {
      data: toChartPoints(rows ?? [], preferred, usdToEurRate, 'total'),
    }
  } catch (e) {
    console.error('getPortfolioSnapshots error:', e)
    return { error: 'Failed to load portfolio history.' }
  }
}

/**
 * Load daily holding_snapshots for one symbol (RLS), convert USD → preferred.
 * Same SnapshotPoint shape as portfolio series so the Performance chart can reuse it.
 */
export async function getHoldingSnapshots(
  query: HoldingSnapshotQuery
): Promise<GetPortfolioSnapshotsResult> {
  try {
    const symbol = query.symbol?.trim()
    const assetType = query.assetType
    if (!symbol || !assetType) {
      return { error: 'Symbol and asset type are required.' }
    }

    const batch = await getHoldingSnapshotsBatch([{ symbol, assetType }])
    if (batch.error) return { error: batch.error }
    const key = `${assetType}:${symbol}`
    return { data: batch.data?.[key] ?? [] }
  } catch (e) {
    console.error('getHoldingSnapshots error:', e)
    return { error: 'Failed to load holding history.' }
  }
}

export type GetHoldingSnapshotsBatchResult = {
  /** Keys: `${assetType}:${symbol}` */
  data?: Record<string, SnapshotPoint[]>
  error?: string
}

/**
 * Load holding_snapshots for many open symbols in one query (Performance multi-chart).
 */
export async function getHoldingSnapshotsBatch(
  holdings: HoldingSnapshotQuery[]
): Promise<GetHoldingSnapshotsBatchResult> {
  try {
    const cleaned = holdings
      .map((h) => ({
        symbol: h.symbol?.trim(),
        assetType: h.assetType,
      }))
      .filter((h) => h.symbol && h.assetType) as {
      symbol: string
      assetType: HoldingSnapshotQuery['assetType']
    }[]

    if (cleaned.length === 0) {
      return { data: {} }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return { error: 'Not authenticated' }
    }

    const profile = await getCurrentUserProfile()
    const preferred = profile?.preferredCurrency || 'USD'
    const usdToEurRate = await getUsdToEurRate()

    const symbols = [...new Set(cleaned.map((h) => h.symbol))]

    const { data: rows, error } = await supabase
      .from('holding_snapshots')
      .select(
        'snapshot_date, symbol, asset_type, market_value, cost_basis, is_partial, currency'
      )
      .eq('user_id', user.id)
      .in('symbol', symbols)
      .order('snapshot_date', { ascending: true })

    if (error) {
      console.error('holding_snapshots batch fetch error:', error)
      return { error: 'Failed to load holding history.' }
    }

    const wanted = new Set(
      cleaned.map((h) => `${h.assetType}:${h.symbol}`)
    )
    const grouped: Record<string, typeof rows> = {}
    for (const row of rows ?? []) {
      const sym = typeof row.symbol === 'string' ? row.symbol : ''
      const at = typeof row.asset_type === 'string' ? row.asset_type : ''
      const key = `${at}:${sym}`
      if (!wanted.has(key)) continue
      if (!grouped[key]) grouped[key] = []
      grouped[key]!.push(row)
    }

    const data: Record<string, SnapshotPoint[]> = {}
    for (const key of wanted) {
      data[key] = toChartPoints(
        grouped[key] ?? [],
        preferred,
        usdToEurRate,
        'holding'
      )
    }

    return { data }
  } catch (e) {
    console.error('getHoldingSnapshotsBatch error:', e)
    return { error: 'Failed to load holding history.' }
  }
}
