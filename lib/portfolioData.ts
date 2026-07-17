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
 * - Fetches the user's transactions (source of truth).
 * - Computes holdings using average cost method.
 * - Fetches live prices (stocks via Finnhub, crypto via CoinGecko).
 * - Enriches holdings with market values + P&L + 24h impact.
 * - Converts all money to preferred currency (market from USD; costs from entry currency).
 * - Cash is netted per-transaction with its own currency so multi-currency cash is correct.
 *
 * Wrapped in React.cache() so that the three independent async Server
 * Components below can each call it safely. The expensive work
 * (DB + external price APIs) runs only once per server request.
 *
 * On failure we return safe defaults + an error message instead of throwing.
 * This lets each UI section render its own friendly error state.
 */
export const getPortfolioData = cache(async (): Promise<PortfolioData> => {
  try {
    const profile = await getCurrentUserProfile()
    const preferredCurrency: PreferredCurrency = profile?.preferredCurrency || 'USD'

    const usdToEurRate = await getUsdToEurRate()
    const usdToPreferredRate = preferredCurrency === 'EUR' ? usdToEurRate : 1

    const transactions = await getUserTransactions()
    const allHoldings = calculateHoldings(transactions || [])

    // Assets only for market price fetch; cash is rebuilt with per-tx FX below.
    const assetHoldings = allHoldings.filter((h) => h.asset_type !== 'cash')
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

    // Cash is valued at face value (no market API). Keep priceData complete so the
    // partial-price banner compares apples-to-apples with holdingsCount.
    for (const cash of preferredCash) {
      priceData[cash.symbol] = { price: 1, change24h: 0 }
    }

    const enrichedHoldings = [...preferredAssets, ...preferredCash]

    const totalMarketValue = enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0)
    const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.totalCost, 0)
    const totalUnrealizedPnl = totalMarketValue - totalCost

    const total24hChange = enrichedHoldings.reduce((sum, h) => sum + h.position24hChange, 0)
    const previousTotalValue = totalMarketValue - total24hChange
    const total24hChangePercent =
      previousTotalValue > 0 ? (total24hChange / previousTotalValue) * 100 : 0

    return {
      transactions: transactions || [],
      enrichedHoldings,
      priceData,
      holdingsCount: enrichedHoldings.length,
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
