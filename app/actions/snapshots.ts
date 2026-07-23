'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/user'
import { convertAmount, getUsdToEurRate } from '@/lib/currency'
import type { SnapshotPoint } from '@/lib/aggregateSnapshots'

export type GetPortfolioSnapshotsResult = {
  data?: SnapshotPoint[]
  error?: string
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

    const points: SnapshotPoint[] = []
    for (const row of rows ?? []) {
      const dateRaw = row.snapshot_date
      const date =
        typeof dateRaw === 'string'
          ? dateRaw.slice(0, 10)
          : dateRaw
            ? String(dateRaw).slice(0, 10)
            : ''
      if (!date) continue

      const mvUsd = Number(row.total_market_value)
      const costUsd = Number(row.total_cost_basis)
      if (!Number.isFinite(mvUsd)) continue

      // Snapshots are stored in USD (v1). Convert to preferred for display.
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

    return { data: points }
  } catch (e) {
    console.error('getPortfolioSnapshots error:', e)
    return { error: 'Failed to load portfolio history.' }
  }
}
