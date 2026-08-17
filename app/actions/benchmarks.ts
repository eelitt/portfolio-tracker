'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserProfile } from '@/lib/user'
import { convertAmount, getUsdToEurRate } from '@/lib/currency'
import { loadBarsFromDb, syncSymbolHistory } from '@/lib/priceHistory'
import {
  BENCHMARK_PRESETS,
  benchmarkSeriesId,
  getBenchmarkPreset,
  type BenchmarkId,
} from '@/lib/benchmarks'
import type { SnapshotPoint } from '@/lib/aggregateSnapshots'

export type GetBenchmarkSeriesResult = {
  data?: Record<string, SnapshotPoint[]>
  error?: string
}

function closesToPoints(
  bars: { time: string; close: number }[],
  preferred: 'USD' | 'EUR',
  usdToEurRate: number
): SnapshotPoint[] {
  const points: SnapshotPoint[] = []
  for (const b of bars) {
    if (!Number.isFinite(b.close) || b.close <= 0) continue
    const marketValue = convertAmount(b.close, preferred, usdToEurRate)
    points.push({
      date: b.time.slice(0, 10),
      marketValue,
      costBasis: 0,
      isPartial: false,
    })
  }
  return points
}

/**
 * Sync (full-once / gap / cache_only) + load daily closes for benchmark ids.
 * Does not run on dashboard GET — call only for newly enabled chips.
 */
export async function getBenchmarkSeries(
  ids: string[]
): Promise<GetBenchmarkSeriesResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return { error: 'Not authenticated' }

    const wanted = [...new Set(ids)]
      .map((id) => getBenchmarkPreset(id))
      .filter((p): p is (typeof BENCHMARK_PRESETS)[number] => Boolean(p))

    if (wanted.length === 0) return { data: {} }

    const supabase = await createClient()
    const profile = await getCurrentUserProfile()
    const preferred = profile?.preferredCurrency || 'USD'
    const usdToEurRate = await getUsdToEurRate()

    const entries = await Promise.all(
      wanted.map(async (preset) => {
        await syncSymbolHistory(supabase, preset.symbol, preset.assetType)
        const loaded = await loadBarsFromDb(
          supabase,
          preset.symbol,
          preset.assetType,
          null
        )
        const seriesId = benchmarkSeriesId(preset.id as BenchmarkId)
        return [seriesId, closesToPoints(loaded.bars, preferred, usdToEurRate)] as const
      })
    )

    return { data: Object.fromEntries(entries) }
  } catch (e) {
    console.error('getBenchmarkSeries error:', e)
    return { error: 'Failed to load benchmark history.' }
  }
}
