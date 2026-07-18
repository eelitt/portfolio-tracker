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

export type TransactionAction = 'buy' | 'sell' | 'inflow' | 'outflow'

/** A single buy or sell transaction recorded by the user. */
export interface Transaction {
  id?: string
  symbol: string
  asset_type: AssetType
  action: TransactionAction
  quantity: number
  unit_price: number
  executed_at: string
  notes?: string
  currency?: 'USD' | 'EUR'   // currency in which the unit_price (assets) or quantity (cash) was denominated at entry time
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
  created_at: string
  updated_at: string
}