/**
 * Holdings query helpers for the Portfolio Analyst agent.
 */

import type { EnrichedHolding } from '../types'
import type { AllocationBreakdown, AllocationSlice, HoldingFilters } from './types'
import {
  MAX_HOLDINGS_LIMIT,
  compactHolding,
  isInMvBase,
  roundMoney,
  sortHoldings,
} from './shared'

/**
 * Filter / sort / limit enriched holdings for agent queries.
 */
export function filterEnrichedHoldings(
  holdings: EnrichedHolding[],
  filters: HoldingFilters = {}
): ReturnType<typeof compactHolding>[] {
  let result = [...holdings]

  if (filters.assetType) {
    result = result.filter((h) => h.asset_type === filters.assetType)
  }
  if (filters.symbol) {
    const sym = filters.symbol.toUpperCase()
    result = result.filter((h) => h.symbol.toUpperCase() === sym)
  }
  if (filters.pricedOnly) {
    result = result.filter((h) => isInMvBase(h))
  }
  if (filters.minUnrealizedPnlPercent !== undefined) {
    const min = filters.minUnrealizedPnlPercent
    result = result.filter(
      (h) => h.priceAvailable && h.asset_type !== 'cash' && h.unrealizedPnlPercent >= min
    )
  }
  if (filters.maxUnrealizedPnlPercent !== undefined) {
    const max = filters.maxUnrealizedPnlPercent
    result = result.filter(
      (h) => h.priceAvailable && h.asset_type !== 'cash' && h.unrealizedPnlPercent <= max
    )
  }

  const sortBy = filters.sortBy ?? 'marketValue'
  const sortDir = filters.sortDir ?? 'desc'
  result = sortHoldings(result, sortBy, sortDir)

  const limit = Math.min(Math.max(filters.limit ?? MAX_HOLDINGS_LIMIT, 1), MAX_HOLDINGS_LIMIT)
  return result.slice(0, limit).map(compactHolding)
}

/**
 * Allocation weights from enriched holdings (priced assets + cash only).
 */
export function allocationBreakdown(holdings: EnrichedHolding[]): AllocationBreakdown {
  const unpricedSymbols = holdings
    .filter((h) => h.asset_type !== 'cash' && !h.priceAvailable)
    .map((h) => h.symbol)

  const inBase = holdings.filter(isInMvBase)
  const totalMarketValue = inBase.reduce((s, h) => s + h.marketValue, 0)

  const bySymbolMap = new Map<string, number>()
  const byTypeMap = new Map<string, number>()

  for (const h of inBase) {
    bySymbolMap.set(h.symbol, (bySymbolMap.get(h.symbol) ?? 0) + h.marketValue)
    byTypeMap.set(h.asset_type, (byTypeMap.get(h.asset_type) ?? 0) + h.marketValue)
  }

  const toSlices = (map: Map<string, number>): AllocationSlice[] =>
    [...map.entries()]
      .map(([key, marketValue]) => ({
        key,
        marketValue: roundMoney(marketValue),
        weightPercent:
          totalMarketValue > 0
            ? Number(((marketValue / totalMarketValue) * 100).toFixed(2))
            : 0,
      }))
      .sort((a, b) => b.marketValue - a.marketValue)

  return {
    totalMarketValue: roundMoney(totalMarketValue),
    bySymbol: toSlices(bySymbolMap),
    byAssetType: toSlices(byTypeMap),
    unpricedSymbols,
  }
}
