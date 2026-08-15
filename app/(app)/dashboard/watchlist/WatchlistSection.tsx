import { getWatchlist } from '@/app/actions/watchlist'
import { getPortfolioData } from '@/lib/portfolioData'
import { getPricesForHoldings } from '@/lib/prices'
import { catalogNameFor } from '@/lib/portfolioAnalyst'
import type { EnrichedWatchlistItem, WatchlistAssetType } from '@/lib/types'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import {
  WATCHLIST_NEWS_FEATURE_TYPE,
  parseHoldingNewsStored,
} from '@/app/actions/ai/holding-news/newsUtils'
import { getCurrentUserProfile } from '@/lib/user'
import HoldingsNewsPopover from '../holdings/HoldingsNewsPopover'
import WatchlistTable from './WatchlistTable'

export default async function WatchlistSection() {
  const [listResult, portfolio, profile, newsResult] = await Promise.all([
    getWatchlist(),
    getPortfolioData(),
    getCurrentUserProfile(),
    getLatestAIInsightForCurrentUser(WATCHLIST_NEWS_FEATURE_TYPE),
  ])

  if (listResult.error || !listResult.data) {
    return (
      <section id="watchlist" className="mb-8 scroll-mt-20">
        <h2 className="section-title mb-4">
          <span className="section-title-accent">Watchlist</span>
        </h2>
        <div className="alert-error">{listResult.error ?? 'Could not load watchlist'}</div>
      </section>
    )
  }

  const rows = listResult.data
  const quotes =
    rows.length > 0
      ? await getPricesForHoldings(
          rows.map((r) => ({ symbol: r.symbol, asset_type: r.asset_type })),
          { forceFresh: false }
        )
      : {}

  const heldSymbols = (portfolio.enrichedHoldings ?? [])
    .filter(
      (h) =>
        h.asset_type !== 'cash' &&
        h.quantity > 0 &&
        (h.asset_type === 'stock' ||
          h.asset_type === 'etf' ||
          h.asset_type === 'crypto')
    )
    .map((h) => ({
      symbol: h.symbol,
      asset_type: h.asset_type as WatchlistAssetType,
    }))

  const items: EnrichedWatchlistItem[] = rows.map((row) => {
    const quote = quotes[row.symbol]
    const priceOk = Boolean(
      quote && Number.isFinite(quote.price) && quote.price > 0
    )
    return {
      ...row,
      name: catalogNameFor(row.symbol, row.asset_type),
      currentPrice: priceOk ? quote.price : null,
      change24h: priceOk && quote.change24h != null ? quote.change24h : null,
      priceAvailable: priceOk,
      inPortfolio: false,
    }
  })

  const stored = newsResult
    ? parseHoldingNewsStored(newsResult.result, newsResult.createdAt)
    : null
  const watchSet = new Set(rows.map((r) => r.symbol.toUpperCase()))
  const watchNews = stored
    ? {
        news: Object.fromEntries(
          Object.entries(stored.news).filter(([sym]) =>
            watchSet.has(sym.toUpperCase())
          )
        ),
        impact: stored.impact
          ? Object.fromEntries(
              Object.entries(stored.impact).filter(([sym]) =>
                watchSet.has(sym.toUpperCase())
              )
            )
          : undefined,
        cachedAt: stored.contentFetchedAt ?? newsResult!.createdAt,
      }
    : null

  const preferredCurrency = portfolio.preferredCurrency ?? 'USD'
  const usdToPreferredRate = portfolio.usdToPreferredRate ?? 1

  return (
    <section id="watchlist" className="mb-8 scroll-mt-20">
      <h2 className="section-title mb-4 flex items-center gap-1.5">
        <span className="section-title-accent">Watchlist</span>
        {rows.length > 0 && (
          <HoldingsNewsPopover
            initialNews={watchNews}
            isAdmin={profile?.admin === true}
            universe="watchlist"
            title="Watchlist news"
            label="AI news for your watchlist"
          />
        )}
      </h2>
      <WatchlistTable
        items={items}
        preferredCurrency={preferredCurrency}
        usdToPreferredRate={usdToPreferredRate}
        heldSymbols={heldSymbols}
        watchNews={watchNews}
      />
    </section>
  )
}
