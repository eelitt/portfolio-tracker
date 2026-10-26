import type { AssetType } from '@/lib/types'
import type { TransactionPnlRow } from '@/lib/transactionPnl'

export type ChartAssetType = Exclude<AssetType, 'cash'>

/** Who wrote bars to price_bars. `coingecko` may exist on legacy rows only. */
export type PriceBarSource = 'finnhub' | 'coingecko' | 'binance' | 'yahoo'

export type SyncMode = 'full' | 'gap' | 'cache_only'

export type ChartRange = '1M' | '3M' | '1Y' | 'Max'

export type PriceBar = {
  time: string // ISO date YYYY-MM-DD (UTC day)
  open: number
  high: number
  low: number
  close: number
  /** Stored when provider sends it (e.g. Binance); not shown in UI yet. */
  volume?: number | null
}

export type TradeMarker = {
  /** Ledger row id, used to join transaction P&L. */
  id?: string
  time: string // ISO date or datetime for tooltip
  timeKey: string // YYYY-MM-DD for chart alignment
  side: 'buy' | 'sell'
  price: number
  quantity: number
  currency: 'USD' | 'EUR'
  notes?: string | null
  /** Set on buy markers from transactionPnl. Sells stay unset. */
  pnl?: TransactionPnlRow
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
  /** Provider used for the latest successful bar fetch (if any). */
  historySource?: PriceBarSource
  error?: string
  meta: PriceBarSyncMeta
}

export type HoldingPriceChartResult = {
  data?: {
    symbol: string
    assetType: ChartAssetType
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
