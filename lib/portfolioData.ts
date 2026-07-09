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

    // Convert everything to display currency.
    // - Each holding records the currency its unit_prices/costs were denominated in (from tx at entry time,
    //   or 'USD' for legacy non-cash).
    // - For non-cash, live prices come from APIs in USD. If the holding's entry currency is EUR we first
    //   convert the market values (currentPrice, marketValue, PnL impact) into that entry currency.
    // - Cash amounts are already in their recorded currency after enrich (price=1).
    // - Then convert from the holding's entry currency to the user's current preferredCurrency.
    enrichedHoldings = enrichedHoldings.map(h => {
      const entryCurr = h.currency || 'USD'

      let base = { ...h }

      // Adjust market data (which enrich based on USD API price) into entryCurr when necessary.
      if (entryCurr === 'EUR' && h.asset_type !== 'cash') {
        const toEntry = usdToEurRate
        base = {
          ...h,
          currentPrice: h.currentPrice * toEntry,
          marketValue: h.marketValue * toEntry,
          unrealizedPnl: h.unrealizedPnl * toEntry,
          position24hChange: h.position24hChange * toEntry,
          // avgCost / totalCost / realizedPnl already in entryCurr from the transactions
        }
      }

      if (entryCurr === preferredCurrency) {
        return base
      }

      // Convert from entry currency to display preferred
      let convRate = 1
      if (entryCurr === 'USD' && preferredCurrency === 'EUR') {
        convRate = usdToEurRate
      } else if (entryCurr === 'EUR' && preferredCurrency === 'USD') {
        convRate = 1 / usdToEurRate
      }

      if (h.asset_type === 'cash') {
        // Cash is special: "quantity" represents the face amount in entryCurr.
        // When displaying in preferred currency, convert the face amount (balance),
        // but keep the "price per cash unit" as 1 in the display currency.
        // This makes the holdings grid show the cash balance in preferred terms.
        const convertedQty = Number((base.quantity * convRate).toFixed(2))
        return {
          ...base,
          quantity: convertedQty,
          avgCost: 1,
          totalCost: convertedQty,
          currentPrice: 1,
          marketValue: convertedQty,
          unrealizedPnl: 0,
          unrealizedPnlPercent: 0,
          position24hChange: 0,
          realizedPnl: Number(((base.realizedPnl || 0) * convRate).toFixed(2)),
        }
      }

      return {
        ...base,
        avgCost: base.avgCost * convRate,
        totalCost: base.totalCost * convRate,
        currentPrice: base.currentPrice * convRate,
        marketValue: base.marketValue * convRate,
        unrealizedPnl: base.unrealizedPnl * convRate,
        position24hChange: base.position24hChange * convRate,
        realizedPnl: base.realizedPnl * convRate,
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
      usdToEurRate,
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
      usdToEurRate: 0.92,
      error: 'Failed to load your portfolio data. Please try refreshing the page.',
    }
  }
})
