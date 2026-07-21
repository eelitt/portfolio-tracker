/**
 * Shared internals for Portfolio Analyst helpers.
 * Not re-exported from the package barrel.
 */

import type { EnrichedHolding } from '../types'
import type { HoldingSortBy, PortfolioTotals } from './types'

export const MAX_HOLDINGS_LIMIT = 30

export function roundMoney(n: number): number {
  return Number(n.toFixed(2))
}

/** Match dashboard: market value base is priced assets + cash only. */
export function isInMvBase(h: EnrichedHolding): boolean {
  return h.priceAvailable || h.asset_type === 'cash'
}

export function portfolioTotals(holdings: EnrichedHolding[]): PortfolioTotals {
  const inBase = holdings.filter(isInMvBase)
  const totalMarketValue = roundMoney(inBase.reduce((s, h) => s + h.marketValue, 0))
  const totalCost = roundMoney(holdings.reduce((s, h) => s + h.totalCost, 0))
  const pricedAssets = holdings.filter((h) => h.priceAvailable && h.asset_type !== 'cash')
  const totalUnrealizedPnl = roundMoney(
    pricedAssets.reduce((s, h) => s + h.unrealizedPnl, 0)
  )
  return {
    totalMarketValue,
    totalCost,
    totalUnrealizedPnl,
    holdingsCount: holdings.filter((h) => h.quantity > 0).length,
    pricedCount: pricedAssets.length + holdings.filter((h) => h.asset_type === 'cash').length,
  }
}

export function sortHoldings(
  holdings: EnrichedHolding[],
  sortBy: HoldingSortBy,
  sortDir: 'asc' | 'desc'
): EnrichedHolding[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...holdings].sort((a, b) => {
    if (sortBy === 'symbol') {
      return dir * a.symbol.localeCompare(b.symbol)
    }
    const av = a[sortBy]
    const bv = b[sortBy]
    return dir * (av - bv)
  })
}

export function compactHolding(h: EnrichedHolding) {
  return {
    symbol: h.symbol,
    assetType: h.asset_type,
    quantity: h.quantity,
    avgCost: roundMoney(h.avgCost),
    totalCost: roundMoney(h.totalCost),
    currentPrice: h.priceAvailable ? roundMoney(h.currentPrice) : null,
    marketValue: h.priceAvailable || h.asset_type === 'cash' ? roundMoney(h.marketValue) : null,
    unrealizedPnl:
      h.priceAvailable && h.asset_type !== 'cash' ? roundMoney(h.unrealizedPnl) : null,
    unrealizedPnlPercent:
      h.priceAvailable && h.asset_type !== 'cash'
        ? Number(h.unrealizedPnlPercent.toFixed(2))
        : null,
    change24h: h.priceAvailable ? Number(h.change24h.toFixed(2)) : null,
    priceAvailable: h.priceAvailable || h.asset_type === 'cash',
    currency: h.currency ?? 'USD',
  }
}
