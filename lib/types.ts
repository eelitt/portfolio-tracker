/**
 * Core domain types for the Portfolio Tracker.
 *
 * These types are used across the app:
 * - Transaction: the persisted row from the database.
 * - Holding: the result of running calculateHoldings() on a user's transactions.
 * - EnrichedHolding: Holding + live market data (used for UI cards, pie, exports, 24h change).
 */

/** A single buy or sell transaction recorded by the user. */
export interface Transaction {
  id: string
  symbol: string
  asset_type: 'stock' | 'crypto'
  action: 'buy' | 'sell'
  quantity: number
  unit_price: number
  executed_at: string
  notes?: string
}

/**
 * A currently open position.
 * Produced by calculateHoldings().
 * realizedPnl tracks profit/loss from sells that reduced this position.
 */
export interface Holding {
  symbol: string
  asset_type: 'stock' | 'crypto'
  quantity: number
  avgCost: number
  totalCost: number
  realizedPnl: number
}

/**
 * Holding augmented with current market data.
 * Used everywhere the UI needs to show "what is it worth right now?"
 */
export type EnrichedHolding = Holding & {
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  change24h: number
  position24hChange: number
}

export interface Goal {
  id: string
  name: string
  target_amount: number
}