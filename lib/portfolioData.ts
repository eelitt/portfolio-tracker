import { cache } from 'react'
import { getUserTransactions } from '@/app/actions/transactions'
import { calculateHoldings, enrichHoldings } from './calculatePortfolio'
import { getPricesForHoldings } from './priceService'
import { getCurrentUserProfile, type PreferredCurrency } from '@/app/actions/users'
import { getUsdToEurRate } from './currency'
import {
  calculateCashHoldingsInPreferred,
  toPreferredHolding,
} from './convertToPreferred'

/**
 * Shape returned to all dashboard sections.
 * Contains both raw data (for exports/table) and pre-computed aggregates
 * (for summary cards) so components stay thin.
 *
 * All monetary values are converted to the user's preferred currency.
 */
export type PortfolioData = {
  transactions: any[]
  enrichedHoldings: any[]
  priceData: Record<string, { price: number; change24h: number | null }>
  holdingsCount: number
  /** Non-cash holdings only */
  assetCount: number
  /** Non-cash holdings with a valid live quote */
  pricedAssetCount: number
  unpricedSymbols: string[]
  totalMarketValue: number
  totalCost: number
  totalUnrealizedPnl: number
  total24hChange: number
  total24hChangePercent: number
  preferredCurrency: PreferredCurrency
  usdToPreferredRate: number
  usdToEurRate: number
  error: string | null
}

/**
 * Single source of truth for all dashboard data.
 *
 * Market value and 24h change only include holdings with valid live prices
 * (plus cash). Cost basis includes all open positions. Unrealized P&L is
 * summed only for priced assets so a missing quote is not treated as $0.
 */
export const getPortfolioData = cache(async (): Promise<PortfolioData> => {
  try {
    const profile = await getCurrentUserProfile()
    const preferredCurrency: PreferredCurrency = profile?.preferredCurrency || 'USD'

    const usdToEurRate = await getUsdToEurRate()
    const usdToPreferredRate = preferredCurrency === 'EUR' ? usdToEurRate : 1

    const transactions = await getUserTransactions()
    const allHoldings = calculateHoldings(transactions || [])

    const assetHoldings = allHoldings.filter((h) => h.asset_type !== 'cash')
    // Live quotes by default (forceFresh) — dashboard KPIs must be trustworthy on first paint
    const priceData = await getPricesForHoldings(assetHoldings)
    const enrichedAssets = enrichHoldings(assetHoldings, priceData)

    const preferredAssets = enrichedAssets.map((h) =>
      toPreferredHolding(h, preferredCurrency, usdToEurRate)
    )
    const preferredCash = calculateCashHoldingsInPreferred(
      transactions || [],
      preferredCurrency,
      usdToEurRate
    )

    for (const cash of preferredCash) {
      priceData[cash.symbol] = { price: 1, change24h: 0 }
    }

    const enrichedHoldings = [...preferredAssets, ...preferredCash]

    const unpricedSymbols = preferredAssets
      .filter((h) => !h.priceAvailable)
      .map((h) => h.symbol)
    const pricedAssets = preferredAssets.filter((h) => h.priceAvailable)

    // MV + 24h: priced assets + cash only (never treat missing quote as price 0)
    const totalMarketValue =
      pricedAssets.reduce((sum, h) => sum + h.marketValue, 0) +
      preferredCash.reduce((sum, h) => sum + h.marketValue, 0)

    // Full book cost (including unpriced assets)
    const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.totalCost, 0)

    // Unrealized only where we have a fair mark
    const totalUnrealizedPnl = pricedAssets.reduce((sum, h) => sum + h.unrealizedPnl, 0)

    const total24hChange = pricedAssets.reduce((sum, h) => sum + h.position24hChange, 0)
    const previousTotalValue = totalMarketValue - total24hChange
    const total24hChangePercent =
      previousTotalValue > 0 ? (total24hChange / previousTotalValue) * 100 : 0

    return {
      transactions: transactions || [],
      enrichedHoldings,
      priceData,
      holdingsCount: enrichedHoldings.length,
      assetCount: preferredAssets.length,
      pricedAssetCount: pricedAssets.length,
      unpricedSymbols,
      totalMarketValue,
      totalCost,
      totalUnrealizedPnl,
      total24hChange,
      total24hChangePercent,
      preferredCurrency,
      usdToPreferredRate,
      usdToEurRate,
      error: null,
    }
  } catch (error) {
    console.error('Portfolio data fetch error:', error)
    return {
      transactions: [],
      enrichedHoldings: [],
      priceData: {},
      holdingsCount: 0,
      assetCount: 0,
      pricedAssetCount: 0,
      unpricedSymbols: [],
      totalMarketValue: 0,
      totalCost: 0,
      totalUnrealizedPnl: 0,
      total24hChange: 0,
      total24hChangePercent: 0,
      preferredCurrency: 'USD',
      usdToPreferredRate: 1,
      usdToEurRate: 0.92,
      error: 'Failed to load your portfolio data. Please try refreshing the page.',
    }
  }
})
