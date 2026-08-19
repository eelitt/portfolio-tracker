import type { TypeWeightMap } from '@/lib/allocationTargets'

export type GoalStatus = 'ahead' | 'on_track' | 'behind' | 'incomplete'

export type FundingWarning = 'full_mv_overlap' | 'assigned_exceeds_book'

export type TypeRates = {
  stock: number
  etf: number
  crypto: number
  cash: number
}

export type GoalProjection = {
  pv: number
  target: number
  annualRate: number
  months: number | null
  plannedMonthly: number | null
  requiredMonthly: number | null
  projectedValue: number | null
  monthsToTarget: number | null
  status: GoalStatus
}

export type MixWeights = TypeWeightMap

/** Shared BTC (etc.) assumption row used by Plan UI and the engine. */
export type AssumptionRates = {
  cryptoRate: number
  rawCagr: number | null
  windowStart: string | null
  windowEnd: string | null
  source: 'yahoo' | 'fallback'
  computedAt: string | null
}

export type ReturnSlice = {
  symbol: string
  assetType: 'stock' | 'etf' | 'crypto' | 'cash'
  marketValue: number
}

export type CoinAssumption = {
  symbol: string
  planningRate: number | null
  rawCagr: number | null
  windowStart: string | null
  windowEnd: string | null
  years: number | null
  status: 'used' | 'short_history' | 'missing'
}

export type AssumptionPack = {
  fallbackCrypto: number
  btc: AssumptionRates
  coins: CoinAssumption[]
}
