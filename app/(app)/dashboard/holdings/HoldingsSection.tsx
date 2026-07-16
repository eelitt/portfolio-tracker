import { getPortfolioData } from '@/lib/portfolioData'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import AllocationPie from './AllocationPie'
import HoldingsGrid from './HoldingsGrid'

/**
 * Async Server Component that renders the current holdings grid
 * and the allocation pie chart.
 *
 * It shares the exact same cached data promise as SummarySection and
 * TransactionHistorySection thanks to React.cache in getPortfolioData.
 */
export default async function HoldingsSection() {
  const data = await getPortfolioData()

  // Load cached holding news + impact (cheap) for symbol-specific tooltips
  const holdingNewsResult = await getLatestAIInsightForCurrentUser('holding_news')
  const holdingNews = holdingNewsResult?.result?.news
    ? {
        news: holdingNewsResult.result.news as Record<string, string[]>,
        impact:
          holdingNewsResult.result.impact &&
          typeof holdingNewsResult.result.impact === 'object'
            ? (holdingNewsResult.result.impact as Record<string, HoldingNewsImpactEntry>)
            : undefined,
        cachedAt: holdingNewsResult.createdAt,
      }
    : null

  if (data.error) {
    return (
      <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {data.error}
      </div>
    )
  }

  return (
    <>
      {/* Individual holding cards (one per symbol with live price + P&L) - clickable to record a transaction (add/sell) for that holding */}
      <h2 className="text-xl font-semibold mb-4">Holdings</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <HoldingsGrid
          holdings={data.enrichedHoldings}
          preferredCurrency={data.preferredCurrency}
          usdToPreferredRate={data.usdToPreferredRate}
          holdingNews={holdingNews}
        />
      </div>

      {/* Allocation Pie Chart (by current market value) */}
      <div className="mb-10 mt-5">
        <h2 className="text-xl font-semibold mb-4">Allocation</h2>
        <AllocationPie 
          enrichedHoldings={data.enrichedHoldings} 
          preferredCurrency={data.preferredCurrency}
          usdToPreferredRate={data.usdToPreferredRate}
        />
      </div>
    </>
  )
}
