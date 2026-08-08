/**
 * Finnish tax estimator — pure domain barrel.
 *
 * Engine input is TaxableEvent[] (EUR). App rows enter only via adapters.
 */

export type {
  TaxEventSource,
  TaxAssetClass,
  TaxableEventType,
  TaxableEvent,
  CostMethod,
  Lot,
  ConsumedLotSlice,
  MatchedDisposal,
  BasisChoice,
  DisposalTaxLine,
  MethodBreakdown,
  EstimateMode,
  HypotheticalDisposalInput,
  FinnishTaxEstimateInput,
  FinnishTaxEstimateResult,
} from './types'

export {
  FINNISH_TAX_RATES_YEAR_LABEL,
  CAPITAL_INCOME_THRESHOLD_EUR,
  CAPITAL_INCOME_RATE_LOW,
  CAPITAL_INCOME_RATE_HIGH,
  HMO_RATE_UNDER_10Y,
  HMO_RATE_FROM_10Y,
  HMO_HOLDING_YEARS_FOR_40,
  SMALL_DISPOSAL_PROCEEDS_THRESHOLD_EUR,
  DEFAULT_DISCLAIMERS,
} from './finnishRates'

export { estimateProgressiveCapitalTax, roundMoney } from './progressiveTax'
export { buildTaxBrief, buildTaxSummary } from './buildTaxBrief'
export {
  buildLotsAndMatchDisposals,
  hmoRateForConsumedLots,
  hmoRateFromOldestAcquisition,
} from './lots'
export { estimateFinnishCapitalGains, applyHmoVsActual } from './estimateCapitalGains'
export { appTransactionsToTaxableEvents } from './adapters/appTransactions'
export type { AppTxAdapterOptions } from './adapters/appTransactions'
