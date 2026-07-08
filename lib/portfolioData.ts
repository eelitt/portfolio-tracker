import { cache } from 'react'
import { getUserTransactions } from '@/app/actions/transactions'
import { calculateHoldings, enrichHoldings } from './calculatePortfolio'
import { getPricesForHoldings } from './priceService'
import { getCurrentUserProfile, type PreferredCurrency } from '@/app/actions/users'
import { getUsdToEurRate, convertAmount } from './currency'

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
    // Get user's preferred display currency
    const profile = await getCurrentUserProfile()
    const preferredCurrency: PreferredCurrency = profile?.preferredCurrency || 'USD'

    // Always fetch the current USD->EUR rate so we can convert in both directions
    // when preferred currency changes or when cash was denominated in the other currency.
    const usdToEurRate = await getUsdToEurRate()

    // The multiplier to go from USD to current preferred display currency
    const usdToPreferredRate = preferredCurrency === 'EUR' ? usdToEurRate : 1

    // Base data: user's transactions are the single source of truth.
    const transactions = await getUserTransactions()
    const holdings = calculateHoldings(transactions || [])

    // Live prices + enrichment (can be slow due to external APIs).
    // Note: getPricesForHoldings already uses fetch revalidation (60s).
    const priceData = await getPricesForHoldings(holdings)
    let enrichedHoldings = enrichHoldings(holdings, priceData)

    // Convert to display currency.
    // - Non-cash (stock/etf/crypto): prices come in USD → convert using usdToPreferredRate
    // - Cash: the quantity/amount is denominated in the currency recorded at entry time (h.currency).
    //   Convert from that original currency to current preferred using appropriate rate.
    enrichedHoldings = enrichedHoldings.map(h => {
      if (h.asset_type === 'cash') {
        const cashCurr = h.currency || 'USD'
        if (cashCurr === preferredCurrency) {
          return h
        }
        // compute rate from cashCurr to preferredCurrency
        let convRate = 1
        if (cashCurr === 'USD' && preferredCurrency === 'EUR') {
          convRate = usdToEurRate
        } else if (cashCurr === 'EUR' && preferredCurrency === 'USD') {
          convRate = 1 / usdToEurRate
        } else if (cashCurr === 'EUR' && preferredCurrency === 'EUR') {
          convRate = 1
        }
        return {
          ...h,
          avgCost: h.avgCost * convRate,
          totalCost: h.totalCost * convRate,
          currentPrice: h.currentPrice * convRate,
          marketValue: h.marketValue * convRate,
          unrealizedPnl: h.unrealizedPnl * convRate,
          position24hChange: h.position24hChange * convRate,
        }
      } else {
        // market assets are in USD
        if (preferredCurrency === 'USD') {
          return h
        }
        const convRate = usdToPreferredRate
        return {
          ...h,
          avgCost: h.avgCost * convRate,
          totalCost: h.totalCost * convRate,
          currentPrice: h.currentPrice * convRate,
          marketValue: h.marketValue * convRate,
          unrealizedPnl: h.unrealizedPnl * convRate,
          position24hChange: h.position24hChange * convRate,
        }
      }
    })

    // Pre-compute all the summary numbers here so the UI components
    // don't have to repeat the reduce logic.
    // All values are now in the preferred display currency.
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
      preferredCurrency,
      usdToPreferredRate,
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
      preferredCurrency: 'USD',
      usdToPreferredRate: 1,
      error: 'Failed to load your portfolio data. Please try refreshing the page.',
    }
  }
})
