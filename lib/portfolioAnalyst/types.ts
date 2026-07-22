/**
 * Types for Portfolio Analyst pure helpers (tools, scenarios, chat add-transaction).
 */

import type { AssetType, TransactionAction } from '../types'

export type HoldingSortBy =
  | 'marketValue'
  | 'unrealizedPnlPercent'
  | 'unrealizedPnl'
  | 'symbol'

export type HoldingFilters = {
  assetType?: AssetType
  symbol?: string
  minUnrealizedPnlPercent?: number
  maxUnrealizedPnlPercent?: number
  /** Only positions with a live quote (and cash, which is always "priced") */
  pricedOnly?: boolean
  sortBy?: HoldingSortBy
  sortDir?: 'asc' | 'desc'
  limit?: number
}

export type AllocationSlice = {
  key: string
  marketValue: number
  weightPercent: number
}

export type AllocationBreakdown = {
  totalMarketValue: number
  bySymbol: AllocationSlice[]
  byAssetType: AllocationSlice[]
  unpricedSymbols: string[]
}

export type RealizedPnlFilters = {
  year?: number
  assetType?: AssetType
  symbol?: string
}

export type RealizedPnlResult = {
  totalRealizedPnl: number
  bySymbol: { symbol: string; assetType: AssetType; realizedPnl: number }[]
  sellCount: number
}

export type PortfolioTotals = {
  totalMarketValue: number
  totalCost: number
  totalUnrealizedPnl: number
  holdingsCount: number
  pricedCount: number
}

export type ScenarioSnapshot = PortfolioTotals & {
  allocationBySymbol: AllocationSlice[]
}

export type SellFractionInput = {
  symbol: string
  /** 0–1 fraction of current quantity to sell. Ignored if quantity is set. */
  fraction?: number
  /** Absolute quantity to sell. Takes precedence over fraction when set. */
  quantity?: number
}

export type SellFractionResult =
  | {
      ok: true
      symbol: string
      soldQuantity: number
      sellPrice: number
      impliedRealized: number
      before: ScenarioSnapshot
      after: ScenarioSnapshot
      notes: string[]
    }
  | { ok: false; error: string }

export type PriceShock = {
  symbol: string
  /** e.g. -50 for a 50% drawdown */
  priceChangePercent: number
}

export type PriceShockResult =
  | {
      ok: true
      shocksApplied: PriceShock[]
      before: ScenarioSnapshot
      after: ScenarioSnapshot
      notes: string[]
    }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Chat “add transaction” (prepare → confirm)
// ---------------------------------------------------------------------------

export type CurrencyCode = 'USD' | 'EUR'

/** Structured fields extracted from chat for validation before insert. */
export type ChatAddTransactionInput = {
  /** User wording used for currency / ambiguity checks (required). */
  sourceText: string
  symbol?: string | null
  asset_type?: AssetType | null
  action?: TransactionAction | null
  quantity?: number | null
  unit_price?: number | null
  executed_at?: string | null
  notes?: string | null
  /** Model guess — text detection wins when present. */
  currency?: CurrencyCode | null
}

export type ValidatedTxDraft = {
  symbol: string
  asset_type: AssetType
  action: TransactionAction
  quantity: number
  unit_price: number
  executed_at: string
  notes?: string
  currency: CurrencyCode
  currencySource: 'text'
}

export type ValidateDraftResult = {
  status: 'incomplete' | 'invalid' | 'ready'
  missing: string[]
  errors: string[]
  warnings: string[]
  draft?: ValidatedTxDraft
  summary?: string
}
