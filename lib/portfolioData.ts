import { cache } from 'react'
import { getUserTransactions } from '@/app/actions/transactions'
import { calculateHoldings, enrichHoldings } from './calculatePortfolio'
import { getPricesForHoldings } from './priceService'

/**
 * Shape returned to all dashboard sections.
 * Contains both raw data (for exports/table) and pre-computed aggregates
 * (for summary cards) so components stay thin.
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
  error: string | null
}

/**
 * Single source of truth for all dashboard data.
 *
 * - Fetches the user's transactions (source of truth).
 * - Computes holdings using average cost method.
 * - Fetches live prices (stocks via Finnhub, crypto via CoinGecko).
 * - Enriches holdings with market values + P&L + 24h impact.
 * - Calculates top-level portfolio metrics.
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
    // Base data: user's transactions are the single source of truth.
    const transactions = await getUserTransactions()
    const holdings = calculateHoldings(transactions || [])

    // Live prices + enrichment (can be slow due to external APIs).
    // Note: getPricesForHoldings already uses fetch revalidation (60s).
    const priceData = await getPricesForHoldings(holdings)
    const enrichedHoldings = enrichHoldings(holdings, priceData)

    // Pre-compute all the summary numbers here so the UI components
    // don't have to repeat the reduce logic.
    const totalMarketValue = enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0)
    const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.totalCost, 0)
    const totalUnrealizedPnl = totalMarketValue - totalCost

    const total24hChange = enrichedHoldings.reduce((sum, h) => sum + h.position24hChange, 0)
    const previousTotalValue = totalMarketValue - total24hChange
    const total24hChangePercent = previousTotalValue > 0 
      ? (total24hChange / previousTotalValue) * 100 
      : 0

    return {
      transactions: transactions || [],
      enrichedHoldings,
      priceData,
      holdingsCount: holdings.length,
      totalMarketValue,
      totalCost,
      totalUnrealizedPnl,
      total24hChange,
      total24hChangePercent,
      error: null,
    }
  } catch (error) {
    console.error('Portfolio data fetch error:', error)
    // Return a safe "empty" shape so the UI can still render
    // without crashing. Individual sections decide how to display the error.
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
      error: 'Failed to load your portfolio data. Please try refreshing the page.',
    }
  }
})
