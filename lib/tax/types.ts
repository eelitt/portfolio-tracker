/**
 * Source-agnostic Finnish capital-gains types.
 * Tax engine code should depend only on these — not on app Transaction rows.
 */

export type TaxEventSource =
  | { kind: 'app_transaction'; transactionId: string }
  | { kind: 'manual' }
  | { kind: 'blockchain'; chainId: string; txHash: string; logIndex?: number }
  | { kind: 'import'; importId?: string }

export type TaxAssetClass = 'crypto' | 'security' | 'other'

export type TaxableEventType = 'acquisition' | 'disposal'

/**
 * Capital-gains building block. Monetary fields are EUR-normalized at the boundary.
 */
export type TaxableEvent = {
  id: string
  assetKey: string
  assetClass: TaxAssetClass
  type: TaxableEventType
  /** Always > 0 */
  quantity: number
  /** Per-unit EUR (acquisition cost or disposal proceeds before fee handling) */
  unitPriceEur: number
  executedAt: string
  /** Optional fee in EUR (actual-cost path only when comparing to HMO) */
  feeEur?: number
  source: TaxEventSource
  /** false → prefer HMO messaging / treat actual cost as unreliable */
  costKnown?: boolean
  notes?: string
}

export type CostMethod = 'fifo' | 'weighted_average'

export type Lot = {
  quantity: number
  unitCostEur: number
  acquiredAt: string
  source?: TaxEventSource
  costKnown: boolean
}

export type ConsumedLotSlice = {
  quantity: number
  unitCostEur: number
  acquiredAt: string
  costEur: number
  costKnown: boolean
}

export type MatchedDisposal = {
  disposalEventId: string
  assetKey: string
  assetClass: TaxAssetClass
  quantity: number
  proceedsEur: number
  feeEur: number
  executedAt: string
  actualCostEur: number
  costBasisReliable: boolean
  /** 0.2 or 0.4 based on holding-period rule for this disposal */
  hmoRate: number
  consumedLots: ConsumedLotSlice[]
  method: CostMethod
  /** True when sell qty exceeded open inventory (capped) */
  quantityCapped: boolean
}

export type BasisChoice = 'actual' | 'hmo' | 'none'

/** Per-disposal tax base after HMO vs actual rules */
export type DisposalTaxLine = {
  disposalEventId: string
  assetKey: string
  quantity: number
  proceedsEur: number
  actualCostEur: number
  feeEur: number
  hmoRate: number
  hmoAmountEur: number
  gainIfActualEur: number
  gainIfHmoEur: number
  /** Taxable gain (>0) or loss (<0). Losses only from actual cost path. */
  taxableGainOrLossEur: number
  basisUsed: BasisChoice
  costBasisReliable: boolean
  holdingPeriodNote: string
  isHypothetical?: boolean
}

export type MethodBreakdown = {
  method: CostMethod
  disposals: DisposalTaxLine[]
  totalProceedsEur: number
  totalActualCostEur: number
  totalTaxableGainEur: number
  totalTaxableLossEur: number
  /** Net = gains + losses (losses negative) before small-disposal exemption */
  netGainOrLossEur: number
  /** After small-disposal rule and loss netting for tax base */
  taxableBaseEur: number
  estimatedTaxEur: number
  effectiveRateOnBase: number | null
  usedHmoOnAnyDisposal: boolean
  notes: string[]
}

export type EstimateMode = 'hypothetical_sell' | 'ytd' | 'full'

export type HypotheticalDisposalInput = {
  assetKey: string
  quantity: number
  unitPriceEur: number
  executedAt?: string
  feeEur?: number
  assetClass?: TaxAssetClass
}

export type FinnishTaxEstimateInput = {
  events: TaxableEvent[]
  taxYear: number
  mode: EstimateMode
  hypothetical?: HypotheticalDisposalInput
  otherCapitalIncomeEur?: number
}

export type FinnishTaxEstimateResult = {
  currency: 'EUR'
  taxYear: number
  mode: EstimateMode
  ratesYearLabel: string
  otherCapitalIncomeEur: number
  methods: {
    weightedAverage: MethodBreakdown
    fifo: MethodBreakdown
  }
  comparison: {
    cheaperMethod: CostMethod | 'tie'
    taxDeltaEur: number
    notes: string[]
  }
  smallDisposal: {
    totalProceedsInScopeEur: number
    thresholdEur: number
    mayBeTaxFree: boolean
    note: string
  }
  eventsSummary: {
    count: number
    sources: Array<TaxEventSource['kind']>
  }
  yearEndNotes: string[]
  assumptions: string[]
  disclaimers: string[]
  openLotsAfter: {
    fifo: Array<{ assetKey: string; quantity: number; oldestAcquiredAt: string | null }>
    weightedAverage: Array<{
      assetKey: string
      quantity: number
      avgCostEur: number
      oldestAcquiredAt: string | null
    }>
  }
}
