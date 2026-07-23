'use server'

/**
 * Holding News server action — public entry for the sidebar / AI Insights UI.
 *
 * Flow:
 *  1. Auth + portfolio checks
 *  2. Load cached user_ai_insights row (feature_type holding_news)
 *  3. If last check < 24h and package has content → return cache (non-admin only)
 *     (admins skip cooldown; new holdings wait until the next allowed fetch)
 *  4. Fetch news:
 *     - stock/etf → Finnhub company-news (date-ranged)
 *     - crypto → xAI live web/X search
 *  5. First-time symbols still empty → one 14d retry (same sources)
 *  6. Impact LLM for changed symbols with bullets → persist
 */

import { getCurrentUser, isCurrentUserAdmin } from '@/lib/user'
import { getPortfolioData } from '@/lib/portfolioData'
import {
  updateLastAICallTime,
  getLatestAIInsight,
} from '@/app/actions/ai/storage'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { callXaiResponsesWithSearch } from './xaiLiveSearch'
import { analyzeNewsImpact } from './analyzeImpact'
import { saveHoldingNewsPackage } from './persist'
import { fetchFinnhubCompanyNewsBullets } from './finnhubCompanyNews'
import {
  buildHoldingNewsSystemPrompt,
  buildHoldingNewsUserPrompt,
} from './prompts'
import {
  HOLDING_NEWS_COOLDOWN_MS,
  HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS,
  HOLDING_NEWS_FEATURE_TYPE,
  type CachedInsight,
  type HoldingNewsSuccessResult,
  computeNewsWindow,
  computeNewsWindowDays,
  selectHoldingsForNews,
  parseHoldingNewsJson,
  normalizeHoldingNews,
  newsHasAnyBullets,
  symbolHasBullets,
  mergeHoldingNews,
  buildHoldingNewsMergeMessage,
  parseHoldingNewsStored,
  toCooldownResult,
  buildNextRefreshAt,
  hasUncoveredHoldings,
  symbolsEligibleForExtendedLookback,
} from './newsUtils'

/** Discriminated result for useHoldingNews (success fields vs error). */
export type HoldingNewsResult =
  | HoldingNewsSuccessResult
  | { error: string; news?: undefined; impact?: undefined }

type NewsHolding = { symbol: string; assetType: string; name: string }

function isEquityAssetType(assetType: string): boolean {
  return assetType === 'stock' || assetType === 'etf'
}

/**
 * Fetch live holding news for the user's top holdings, then impact analysis.
 * Non-admin: at most one full package check per 24h unless new uncovered symbols.
 */
export async function generateHoldingNews(): Promise<HoldingNewsResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const data = await getPortfolioData()
  if (data.error || data.totalMarketValue === 0) {
    return { error: 'No portfolio data available to analyze.' }
  }

  const holdingsPreview = selectHoldingsForNews(data)
  const hasCrypto = holdingsPreview.some(h => h.assetType === 'crypto')
  const hasEquity = holdingsPreview.some(h => isEquityAssetType(h.assetType))

  if (hasCrypto && !process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured.' }
  }
  if (hasEquity && !process.env.FINNHUB_API_KEY) {
    return {
      error:
        'Stock/ETF news requires FINNHUB_API_KEY. Crypto-only portfolios can use XAI_API_KEY alone.',
    }
  }
  if (!process.env.XAI_API_KEY && !process.env.FINNHUB_API_KEY) {
    return { error: 'News services are not configured.' }
  }

  try {
    const cached = await getLatestAIInsight(user.id, HOLDING_NEWS_FEATURE_TYPE)
    const stored = cached
      ? parseHoldingNewsStored(cached.result, cached.createdAt)
      : null

    const holdings = holdingsPreview
    const admin = await isCurrentUserAdmin()

    // --- 24h cooldown for non-admins only (new/uncovered holdings do not bypass) ---
    if (
      !admin &&
      cached &&
      stored &&
      newsHasAnyBullets(stored.news)
    ) {
      const lastCheck = Date.parse(stored.lastCheckedAt ?? cached.createdAt)
      const elapsed = Date.now() - lastCheck
      const isLiveSearchResult = typeof stored.windowFrom === 'string'
      const shouldEnforceCooldown =
        isLiveSearchResult && newsHasAnyBullets(stored.news)

      if (
        elapsed < HOLDING_NEWS_COOLDOWN_MS &&
        shouldEnforceCooldown &&
        !Number.isNaN(lastCheck)
      ) {
        const nextRefreshAt = buildNextRefreshAt(lastCheck)
        const hoursLeft = Math.max(
          1,
          Math.ceil((HOLDING_NEWS_COOLDOWN_MS - elapsed) / (60 * 60 * 1000))
        )
        return toCooldownResult(stored, {
          nextRefreshAt,
          message: `Showing cached news. Next refresh available in ~${hoursLeft}h.`,
        })
      }
    }

    const windowBase: CachedInsight | null =
      cached && stored && typeof stored.windowFrom === 'string' ? cached : null

    return await runLiveHoldingNewsFetch(
      user.id,
      holdings,
      windowBase,
      cached,
      stored
    )
  } catch (e) {
    console.error('Holding news error', e)
    const msg = e instanceof Error ? e.message : ''
    if (
      msg.includes('xAI request failed') ||
      msg.includes('Live news') ||
      msg.includes('Empty response')
    ) {
      return {
        error:
          'Live news search is temporarily unavailable (xAI). Please try again in a minute.',
      }
    }
    return { error: 'Failed to fetch holding news. Please try again later.' }
  }
}

/**
 * Live pipeline: Finnhub (equity) + xAI (crypto) → optional 14d first-time empty → impact → persist.
 */
async function runLiveHoldingNewsFetch(
  userId: string,
  holdings: NewsHolding[],
  windowBase: CachedInsight | null,
  previousRow: CachedInsight | null,
  previousStored: ReturnType<typeof parseHoldingNewsStored>
): Promise<HoldingNewsResult> {
  if (holdings.length === 0) {
    return { error: 'No non-cash holdings to fetch news for.' }
  }

  const symbols = holdings.map(h => h.symbol)
  const previousNews = previousStored?.news ?? null

  const needsBaseline = hasUncoveredHoldings(symbols, previousNews)
  const lookbackFrom =
    !needsBaseline && windowBase && previousStored
      ? new Date(previousStored.lastCheckedAt ?? windowBase.createdAt)
      : null
  const pass1Window = computeNewsWindow(lookbackFrom)

  const incoming1 = await fetchNewsForHoldings(holdings, pass1Window)
  let merge = mergeHoldingNews(previousNews, incoming1, symbols)

  const extendedSymbols = symbolsEligibleForExtendedLookback(
    symbols,
    previousNews,
    merge.news
  )

  let windowFrom = pass1Window.fromDate
  let windowTo = pass1Window.toDate

  if (extendedSymbols.length > 0) {
    const extendedHoldings = holdings.filter(h =>
      extendedSymbols.includes(h.symbol)
    )
    const pass2Window = computeNewsWindowDays(
      HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS
    )
    const incoming2 = await fetchNewsForHoldings(extendedHoldings, pass2Window)
    merge = mergeHoldingNews(merge.news, incoming2, symbols)
    windowFrom = pass2Window.fromDate
    windowTo = pass2Window.toDate
  }

  const nowIso = new Date().toISOString()
  const nextRefreshAt = buildNextRefreshAt()
  const previousImpact = previousStored?.impact ?? {}
  const previousContentFetchedAt =
    previousStored?.contentFetchedAt ?? previousRow?.createdAt ?? nowIso

  const impact: Record<string, HoldingNewsImpactEntry> = {}
  // Carry forward impact only for unchanged symbols that still have bullets
  for (const symbol of symbols) {
    if (
      !merge.changedSymbols.includes(symbol) &&
      previousImpact[symbol] &&
      symbolHasBullets(merge.news[symbol])
    ) {
      impact[symbol] = previousImpact[symbol]
    }
  }

  // Impact for: content changed, OR bullets exist but impact was never stored
  // (fixes stocks that got Finnhub news without a prior impact pass)
  const needImpact = symbols.filter(
    s =>
      symbolHasBullets(merge.news[s]) &&
      (merge.changedSymbols.includes(s) || !previousImpact[s])
  )

  if (needImpact.length > 0 && process.env.XAI_API_KEY) {
    const impactHoldings = holdings.filter(h => needImpact.includes(h.symbol))
    const newsForImpact: Record<string, string[]> = {}
    for (const s of needImpact) {
      newsForImpact[s] = merge.news[s] ?? []
    }
    const freshImpact = await analyzeNewsImpact(newsForImpact, impactHoldings)
    Object.assign(impact, freshImpact)

    for (const s of needImpact) {
      if (!impact[s] && process.env.NODE_ENV === 'development') {
        console.warn(`Holding news impact missing after LLM for ${s}`)
      }
    }
  }

  const contentFetchedAt =
    merge.changedSymbols.length > 0 ? nowIso : previousContentFetchedAt
  let message = buildHoldingNewsMergeMessage(merge)
  if (extendedSymbols.length > 0) {
    const extra =
      extendedSymbols.length === 1
        ? `Expanded search to ${HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS}d for a new holding.`
        : `Expanded search to ${HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS}d for ${extendedSymbols.length} new holdings.`
    message = message ? `${message} ${extra}` : extra
  }

  await saveHoldingNewsPackage(userId, {
    news: merge.news,
    impact,
    windowFrom,
    windowTo,
    contentFetchedAt,
    lastCheckedAt: nowIso,
  })
  await updateLastAICallTime(userId)

  return {
    news: merge.news,
    impact: Object.keys(impact).length > 0 ? impact : undefined,
    contentFetchedAt,
    lastCheckedAt: nowIso,
    cachedAt: contentFetchedAt,
    windowFrom,
    windowTo,
    nextRefreshAt,
    message,
  }
}

/**
 * Stock/ETF → Finnhub company-news; crypto → xAI live search.
 * Always returns a key for every requested holding (possibly []).
 */
async function fetchNewsForHoldings(
  holdings: NewsHolding[],
  window: { fromDate: string; toDate: string; lookbackDays: number }
): Promise<Record<string, string[]>> {
  const equities = holdings.filter(h => isEquityAssetType(h.assetType))
  const cryptos = holdings.filter(h => h.assetType === 'crypto')
  const out: Record<string, string[]> = {}

  if (equities.length > 0) {
    await Promise.all(
      equities.map(async h => {
        out[h.symbol] = await fetchFinnhubCompanyNewsBullets(
          h.symbol,
          window.fromDate,
          window.toDate,
          h.name
        )
      })
    )
  }

  if (cryptos.length > 0) {
    if (!process.env.XAI_API_KEY) {
      for (const h of cryptos) out[h.symbol] = []
    } else {
      const cryptoNews = await liveSearchCryptoNews(cryptos, window)
      Object.assign(out, cryptoNews)
    }
  }

  for (const h of holdings) {
    if (!Object.prototype.hasOwnProperty.call(out, h.symbol)) {
      out[h.symbol] = []
    }
  }

  return out
}

/** xAI multi-ticker live search for crypto only. */
async function liveSearchCryptoNews(
  holdings: NewsHolding[],
  window: { fromDate: string; toDate: string; lookbackDays: number }
): Promise<Record<string, string[]>> {
  const symbols = holdings.map(h => h.symbol)
  const holdingsSummary = holdings
    .map(h => `- ${h.symbol} (${h.assetType}) — ${h.name}`)
    .join('\n')

  const rawText = await callXaiResponsesWithSearch({
    system: buildHoldingNewsSystemPrompt(),
    prompt: buildHoldingNewsUserPrompt({
      fromDate: window.fromDate,
      toDate: window.toDate,
      lookbackDays: window.lookbackDays,
      holdingsSummary,
    }),
    fromDate: window.fromDate,
    toDate: window.toDate,
  })

  const parsed = parseHoldingNewsJson(rawText)
  return normalizeHoldingNews(parsed, symbols, holdings)
}
