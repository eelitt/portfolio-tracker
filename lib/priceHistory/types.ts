import type { AssetType } from '@/lib/types'

export type ChartAssetType = Exclude<AssetType, 'cash'>

export type PriceBarSource = 'finnhub' | 'coingecko' | 'binance'

export type SeriesKind = 'candle' | 'line'

/** How honest the OHLC bodies are for free-tier crypto history. */
export type BarQuality = 'ohlc' | 'mixed' | 'synthetic'

export type SyncMode = 'full' | 'gap' | 'cache_only'

export type ChartRange = '1M' | '3M' | '1Y' | 'Max'

export type PriceBar = {
  time: string // ISO date YYYY-MM-DD (UTC day)
  open: number
  high: number
  low: number
  close: number
  volume?: number | null
}

export type TradeMarker = {
  time: string // ISO date or datetime for tooltip
  timeKey: string // YYYY-MM-DD for chart alignment
  side: 'buy' | 'sell'
  price: number
  quantity: number
  currency: 'USD' | 'EUR'
  notes?: string | null
}

export type PriceBarSyncMeta = {
  symbol: string
  assetType: ChartAssetType
  earliestAt: string | null
  latestAt: string | null
  lastSyncedAt: string | null
  lastError: string | null
}

export type SyncSymbolResult = {
  mode: SyncMode
  barsUpserted: number
  seriesKind: SeriesKind
  /** Provider used for the latest successful bar fetch (if any). */
  historySource?: PriceBarSource
  error?: string
  meta: PriceBarSyncMeta
}

export type HoldingPriceChartResult = {
  data?: {
    symbol: string
    assetType: ChartAssetType
    seriesKind: SeriesKind
    barQuality: BarQuality
    historySource?: PriceBarSource
    bars: PriceBar[]
    markers: TradeMarker[]
    sync: {
      mode: SyncMode
      lastSyncedAt: string | null
      earliestAt: string | null
      latestAt: string | null
      maxDays: number
    }
    preferredCurrency: 'USD' | 'EUR'
  }
  error?: string
}
