import { getPortfolioData } from '@/lib/portfolioData'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import {
  HOLDING_NEWS_FEATURE_TYPE,
  parseHoldingNewsStored,
} from '@/app/actions/ai/holding-news/newsUtils'
import { getPortfolioSnapshots } from '@/app/actions/snapshots'
import HoldingsGrid from './HoldingsGrid'
import HoldingsChartsPanel from './HoldingsChartsPanel'

/**
 * Async Server Component that renders the current holdings grid
 * and the allocation / performance charts panel.
 *
 * It shares the exact same cached data promise as SummarySection and
 * TransactionHistorySection thanks to React.cache in getPortfolioData.
 */
export default async function HoldingsSection() {
  const data = await getPortfolioData()
  const snapshotsResult = await getPortfolioSnapshots()

  // Load cached holding news + impact (cheap) for symbol-specific tooltips
  const holdingNewsResult = await getLatestAIInsightForCurrentUser(HOLDING_NEWS_FEATURE_TYPE)
  const stored = holdingNewsResult
    ? parseHoldingNewsStored(holdingNewsResult.result, holdingNewsResult.createdAt)
    : null
  const holdingNews = stored
    ? {
        news: stored.news,
        impact:
          stored.impact && Object.keys(stored.impact).length > 0
            ? stored.impact
            : undefined,
        cachedAt: stored.contentFetchedAt ?? holdingNewsResult!.createdAt,
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
      <h2 className="text-xl font-semibold mb-4">Holdings</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <HoldingsGrid
          holdings={data.enrichedHoldings}
          preferredCurrency={data.preferredCurrency}
          usdToPreferredRate={data.usdToPreferredRate}
          holdingNews={holdingNews}
        />
      </div>

      <HoldingsChartsPanel
        enrichedHoldings={data.enrichedHoldings}
        preferredCurrency={data.preferredCurrency}
        usdToPreferredRate={data.usdToPreferredRate}
        snapshots={snapshotsResult.data ?? []}
        snapshotsError={snapshotsResult.error ?? null}
      />
    </>
  )
}
