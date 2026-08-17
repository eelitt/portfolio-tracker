import type { AssetType } from '@/lib/types'

export const ALLOC_ASSET_TYPES: AssetType[] = ['stock', 'etf', 'crypto', 'cash']

export type TypeWeightMap = Record<AssetType, number>

export type SymbolOverride = {
  symbol: string
  assetType: Exclude<AssetType, 'cash'>
  weightPercent: number
}

export type AllocationPolicySpec = {
  typeWeights: TypeWeightMap
  symbolOverrides: SymbolOverride[]
  tolerancePp: number
}

export type DriftStatus = 'ok' | 'over' | 'under'

export type DriftRow = {
  key: string
  scope: 'asset_type' | 'symbol'
  actualPercent: number
  targetPercent: number
  deltaPp: number
  deltaValue: number
  status: DriftStatus
}

export type RebalanceMode = 'inplace' | 'new_cash'

export type RebalanceSuggestion = {
  side: 'buy' | 'sell'
  key: string
  keyKind: 'symbol' | 'asset_type'
  notional: number
  reason: string
}

export type AgeBand = 'under_30' | '30_45' | '45_60' | '60_plus'
export type Horizon = 'lt_3y' | '3_10y' | 'gt_10y'
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive'
export type MonthlyContribution =
  | 'none'
  | '1_500'
  | '500_1000'
  | '1000_5000'
  | '5000_plus'

export type InvestorProfile = {
  ageBand?: AgeBand | null
  horizon?: Horizon | null
  riskTolerance?: RiskTolerance | null
  monthlyContribution?: MonthlyContribution | null
}
