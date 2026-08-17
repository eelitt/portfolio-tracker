import { getPortfolioData } from '@/lib/portfolioData'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import {
  HOLDING_NEWS_FEATURE_TYPE,
  parseHoldingNewsStored,
} from '@/app/actions/ai/holding-news/newsUtils'
import { getPortfolioSnapshots } from '@/app/actions/snapshots'
import { getCurrentUserProfile } from '@/lib/user'
import HoldingsGrid from './HoldingsGrid'
import HoldingsChartsPanel from './HoldingsChartsPanel'
import HoldingsNewsPopover from './HoldingsNewsPopover'
import { cashFlowsFromTransactions } from '@/lib/performance'

/**
 * Open Holdings title + grid; Charts is a sibling elevated panel.
 * Holding news batch: title icon popover (cards keep per-symbol tooltips).
 */
export default async function HoldingsSection() {
  const data = await getPortfolioData()
  const snapshotsResult = await getPortfolioSnapshots()
  const profile = await getCurrentUserProfile()

  const holdingNewsResult = await getLatestAIInsightForCurrentUser(
    HOLDING_NEWS_FEATURE_TYPE
  )
  const stored = holdingNewsResult
    ? parseHoldingNewsStored(
        holdingNewsResult.result,
        holdingNewsResult.createdAt
      )
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
      <div id="holdings" className="alert-error mb-6 scroll-mt-20">
        {data.error}
      </div>
    )
  }

  return (
    <div id="holdings" className="scroll-mt-20">
      <section className="mb-8">
        <h2 className="section-title mb-4 flex items-center gap-1.5">
          <span className="section-title-accent">Holdings</span>
          <HoldingsNewsPopover
            initialNews={holdingNews}
            isAdmin={profile?.admin === true}
          />
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <HoldingsGrid
            holdings={data.enrichedHoldings}
            preferredCurrency={data.preferredCurrency}
            usdToPreferredRate={data.usdToPreferredRate}
            holdingNews={holdingNews}
          />
        </div>
      </section>

      <HoldingsChartsPanel
        enrichedHoldings={data.enrichedHoldings}
        preferredCurrency={data.preferredCurrency}
        usdToPreferredRate={data.usdToPreferredRate}
        snapshots={snapshotsResult.data ?? []}
        snapshotsError={snapshotsResult.error ?? null}
        cashFlows={cashFlowsFromTransactions(
          data.transactions,
          data.preferredCurrency,
          data.usdToEurRate
        )}
      />
    </div>
  )
}
