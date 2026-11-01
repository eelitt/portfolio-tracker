/**
 * Core domain types for the Portfolio Tracker.
 *
 * These types are used across the app:
 * - Transaction: the persisted row from the database.
 * - Holding: the result of running calculateHoldings() on a user's transactions.
 * - EnrichedHolding: Holding + live market data (used for UI cards, pie, exports, 24h change).
 */

/**
 * Supported asset types for transactions.
 * - stock: individual company shares
 * - etf: ETFs and index funds (priced via stock APIs)
 * - crypto: cryptocurrencies
 * - cash: savings, cash holdings, money market (face value, no market price)
 */
export type AssetType = 'stock' | 'etf' | 'crypto' | 'cash'

/** Spot asset types plus a perp row. A future is not an allocation or chart type. */
export type LedgerAssetType = AssetType | 'future'

export type SpotAction = 'buy' | 'sell' | 'inflow' | 'outflow'

export type TransactionAction =
  | SpotAction
  | 'funding'
  | 'fee'
  | 'margin_add'
  | 'margin_remove'

export type PositionSide = 'long' | 'short'

/** A single buy or sell transaction recorded by the user. */
export interface Transaction {
  id?: string
  symbol: string
  asset_type: LedgerAssetType
  action: TransactionAction
  /** Null on a future funding, fee, or margin row. */
  quantity: number | null
  /** Null on a future funding, fee, or margin row. */
  unit_price: number | null
  executed_at: string
  notes?: string
  currency?: 'USD' | 'EUR'   // currency in which the unit_price (assets) or quantity (cash) was denominated at entry time
  /** Set on a future row. Null on stock, ETF, crypto, and cash. */
  position_side?: PositionSide | null
  /** Margin, funding, or fee on a future row. Null on other asset types. */
  amount?: number | null
  created_at?: string
}

/**
 * A currently open position.
 * Produced by calculateHoldings().
 * realizedPnl tracks profit/loss from sells that reduced this position.
 */
export interface Holding {
  symbol: string
  asset_type: AssetType
  quantity: number
  avgCost: number
  totalCost: number
  realizedPnl: number
  currency?: 'USD' | 'EUR'   // currency in which unit prices / costs were denominated (assets or cash)
}

/**
 * Holding augmented with current market data.
 * Used everywhere the UI needs to show "what is it worth right now?"
 *
 * priceAvailable is false when no valid live quote was returned for this
 * symbol. In that case market fields are zeroed and must not be treated as
 * a real price of 0 (see portfolio aggregates + holdings UI).
 */
export type EnrichedHolding = Holding & {
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  change24h: number
  position24hChange: number
  priceAvailable: boolean
}

export interface Goal {
  id: string
  name: string
  target_amount: number
  notes?: string                    // Optional notes (e.g. "Invest €300/month")
  is_completed: boolean             // Controls visibility
  completed_at?: string             // When it was marked as completed
  target_date?: string | null
  planned_monthly?: number | null
  assigned_amount?: number | null
  include_cash?: boolean
  created_at: string
  updated_at: string
}

/** Catalog types that can be watched (no cash). */
export type WatchlistAssetType = 'stock' | 'etf' | 'crypto'

/** Persisted watchlist row. */
export interface WatchlistItem {
  id: string
  symbol: string
  asset_type: WatchlistAssetType
  added_at: string
}

/** Watchlist row + live mark for the dashboard table. */
export type EnrichedWatchlistItem = WatchlistItem & {
  name: string
  currentPrice: number | null
  change24h: number | null
  priceAvailable: boolean
  inPortfolio: boolean
}