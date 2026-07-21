/**
 * Portfolio Analyst pure helpers — public barrel.
 *
 * No I/O. Tools load user data via getPortfolioData / getUserTransactions,
 * then call these functions so numbers stay testable and grounded.
 */

export type {
  HoldingSortBy,
  HoldingFilters,
  AllocationSlice,
  AllocationBreakdown,
  RealizedPnlFilters,
  RealizedPnlResult,
  PortfolioTotals,
  ScenarioSnapshot,
  SellFractionInput,
  SellFractionResult,
  PriceShock,
  PriceShockResult,
} from './types'

export { filterEnrichedHoldings, allocationBreakdown } from './holdings'
export { realizedPnlFromTransactions } from './realizedPnl'
export { simulateSellFraction, simulatePriceShock } from './scenarios'
export { compactTransactions } from './transactions'
export {
  detectCurrencyFromText,
  resolveCatalogSymbol,
  validateTransactionDraft,
  sellExceedsHoldingWarning,
} from './nlTransaction'
export type {
  CurrencyCode,
  NlDraftInput,
  ValidatedTxDraft,
  ValidateDraftResult,
} from './nlTransaction'
