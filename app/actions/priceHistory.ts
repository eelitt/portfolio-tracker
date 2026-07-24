'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserProfile } from '@/lib/user'
import { convertAmount, getUsdToEurRate } from '@/lib/currency'
import {
  loadBarsFromDb,
  markersFromTransactions,
  maxHistoryDays,
  rangeToDays,
  syncSymbolHistory,
  toUtcDayIso,
  addUtcDays,
  type ChartAssetType,
  type ChartRange,
  type HoldingPriceChartResult,
  type PriceBar,
} from '@/lib/priceHistory'
import type { Transaction } from '@/lib/types'

function isChartAssetType(v: string): v is ChartAssetType {
  return v === 'stock' || v === 'etf' || v === 'crypto'
}

/**
 * Lazy-load + sync price history for one holding, with buy/sell markers.
 * Crypto: Binance klines (full + gap). Live quotes remain CoinGecko elsewhere.
 */
export async function getHoldingPriceChart(input: {
  symbol: string
  assetType: string
  range?: ChartRange
}): Promise<HoldingPriceChartResult> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { error: 'Not authenticated' }
    }

    const symbol = (input.symbol || '').trim().toUpperCase()
    if (!symbol) {
      return { error: 'Symbol is required' }
    }
    if (!isChartAssetType(input.assetType)) {
      return { error: 'Unsupported asset type for price chart' }
    }
    const assetType = input.assetType
    const range: ChartRange = input.range ?? 'Max'

    const supabase = await createClient()
    const profile = await getCurrentUserProfile()
    const preferredCurrency = profile?.preferredCurrency || 'USD'
    const usdToEurRate = await getUsdToEurRate()

    const sync = await syncSymbolHistory(supabase, symbol, assetType)

    const rangeDays = rangeToDays(range, assetType)
    const fromDay =
      rangeDays == null
        ? null
        : addUtcDays(toUtcDayIso(new Date()), -(rangeDays - 1))

    const loaded = await loadBarsFromDb(supabase, symbol, assetType, fromDay)
    let bars = loaded.bars

    // Convert USD bars to preferred currency for display
    if (preferredCurrency === 'EUR') {
      bars = bars.map(
        (b): PriceBar => ({
          ...b,
          open: convertAmount(b.open, 'EUR', usdToEurRate),
          high: convertAmount(b.high, 'EUR', usdToEurRate),
          low: convertAmount(b.low, 'EUR', usdToEurRate),
          close: convertAmount(b.close, 'EUR', usdToEurRate),
        })
      )
    }

    const { data: txRows, error: txErr } = await supabase
      .from('transactions')
      .select(
        'id, symbol, asset_type, action, quantity, unit_price, executed_at, notes, currency'
      )
      .eq('user_id', user.id)
      .eq('symbol', symbol)
      .in('action', ['buy', 'sell'])
      .order('executed_at', { ascending: true })

    if (txErr) {
      console.error('chart markers txs error:', txErr)
    }

    const transactions = (txRows || []) as Transaction[]
    let markers = markersFromTransactions(
      transactions,
      symbol,
      preferredCurrency,
      usdToEurRate
    )

    if (fromDay) {
      markers = markers.filter((m) => m.timeKey >= fromDay)
    }

    if (bars.length === 0 && sync.error) {
      return { error: sync.error }
    }

    if (bars.length === 0) {
      return {
        error:
          sync.error ||
          'No price history available for this symbol yet. Try again later.',
      }
    }

    return {
      data: {
        symbol,
        assetType,
        bars,
        markers,
        sync: {
          mode: sync.mode,
          lastSyncedAt: sync.meta.lastSyncedAt,
          earliestAt: sync.meta.earliestAt,
          latestAt: sync.meta.latestAt,
          maxDays: maxHistoryDays(assetType),
        },
        preferredCurrency,
      },
      error: sync.error,
    }
  } catch (e) {
    console.error('getHoldingPriceChart error:', e)
    return { error: 'Failed to load price chart. Please try again.' }
  }
}
