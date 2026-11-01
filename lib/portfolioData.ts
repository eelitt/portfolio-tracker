import { cache } from 'react'
import { getUserTransactions } from '@/app/actions/transactions'
import { calculateHoldings, enrichHoldings } from './calculatePortfolio'
import { getPricesForHoldings, getUsdMMarks } from '@/lib/prices'
import { getCurrentUserProfile } from '@/lib/user'
import type { PreferredCurrency } from '@/lib/userTypes'
import { getUsdToEurRate } from './currency'
import {
  aggregatePreferredPortfolio,
  calculateCashHoldingsInPreferred,
  perpQuoteInPreferred,
  toPreferredHolding,
  type PerpHeadlineTerm,
} from './convertToPreferred'
import { ledgerPerpRows, reducePerps } from './perps'

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
  /** One entry per open side. Money is already in preferredCurrency. */
  openPerps: PerpHeadlineTerm[]
  error: string | null
}

/**
 * Single source of truth for all dashboard data.
 *
 * Market value and 24h include priced spot, cash, and open perp equity.
 * Cost is spot plus cash and does not add margin. Unrealized P&L is priced
 * spot plus priced perp unrealized. A missing perp mark keeps margin,
 * funding, and fees in value.
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
    // 60s tagged Data Cache (`prices`) so currency toggles / concurrent Goals
    // reloads reuse quotes instead of thrashing Binance (forceFresh no-store).
    // Explicit Refresh Prices still revalidateTag('prices') then re-fetches.
    const priceData = await getPricesForHoldings(assetHoldings, {
      forceFresh: false,
    })
    const enrichedAssets = enrichHoldings(assetHoldings, priceData)

    const preferredAssets = enrichedAssets.map((h) =>
      toPreferredHolding(h, preferredCurrency, usdToEurRate)
    )
    const perpRows = ledgerPerpRows(transactions || [])
    const perpSymbols = reducePerps({ rows: perpRows }).positions.map(
      (position) => position.symbol
    )
    const perpMarks =
      perpSymbols.length > 0
        ? await getUsdMMarks(perpSymbols, { forceFresh: false })
        : {}
    const preferredCash = calculateCashHoldingsInPreferred(
      transactions || [],
      preferredCurrency,
      usdToEurRate,
      perpMarks
    )

    for (const cash of preferredCash) {
      priceData[cash.symbol] = { price: 1, change24h: 0 }
    }

    const perpBook = reducePerps({ rows: perpRows, marks: perpMarks })
    const perpTerms = perpBook.positions.map((position) =>
      perpQuoteInPreferred(
        position,
        perpMarks[position.symbol],
        preferredCurrency,
        usdToEurRate
      )
    )

    const totals = aggregatePreferredPortfolio(
      preferredAssets,
      preferredCash,
      perpTerms
    )

    return {
      transactions: transactions || [],
      ...totals,
      priceData,
      preferredCurrency,
      usdToPreferredRate,
      usdToEurRate,
      openPerps: perpTerms,
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
      openPerps: [],
      error: 'Failed to load your portfolio data. Please try refreshing the page.',
    }
  }
})
