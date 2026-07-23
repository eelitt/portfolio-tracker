'use server'

/**
 * Holding News server action — public entry for the sidebar / AI Insights UI.
 *
 * Flow:
 *  1. Auth + portfolio + XAI_API_KEY checks
 *  2. Load cached user_ai_insights row (feature_type holding_news)
 *  3. If last check < 24h and all selected symbols already covered → return cache
 *     (admins skip cooldown; uncovered symbols always allow live fetch)
 *  4. Live search 7d (or incremental) → merge
 *  5. First-time symbols still empty → one 14d search for those symbols only
 *  6. Impact for changed symbols → persist
 *
 * Cooldown is holding-news specific (lastCheckedAt). 14d is first-time empty only.
 */

import { getCurrentUser, isCurrentUserAdmin } from '@/lib/user'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
import {
  updateLastAICallTime,
  getLatestAIInsight,
} from '@/app/actions/ai/storage'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { callXaiResponsesWithSearch } from './xaiLiveSearch'
import { analyzeNewsImpact } from './analyzeImpact'
import { saveHoldingNewsPackage } from './persist'
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

  if (!process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured.' }
  }

  try {
    const cached = await getLatestAIInsight(user.id, HOLDING_NEWS_FEATURE_TYPE)
    const stored = cached
      ? parseHoldingNewsStored(cached.result, cached.createdAt)
      : null

    const holdings = selectHoldingsForNews(data)
    const symbols = holdings.map(h => h.symbol)
    const uncovered = hasUncoveredHoldings(symbols, stored?.news)
    const admin = await isCurrentUserAdmin()

    // --- 24h cooldown: only when every selected symbol already covered (non-admin) ---
    if (
      !admin &&
      !uncovered &&
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
 * Live pipeline: 7d (or incremental) → optional 14d for first-time empties → impact → persist.
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

  // Uncovered symbols → full 7d baseline; else incremental since last check
  const needsBaseline = hasUncoveredHoldings(symbols, previousNews)
  const lookbackFrom =
    !needsBaseline && windowBase && previousStored
      ? new Date(previousStored.lastCheckedAt ?? windowBase.createdAt)
      : null
  const pass1Window = computeNewsWindow(lookbackFrom)

  const incoming1 = await liveSearchNews(holdings, pass1Window)
  let merge = mergeHoldingNews(previousNews, incoming1, symbols)

  // First-time only: still empty after 7d → one 14d search for those tickers
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
    const incoming2 = await liveSearchNews(extendedHoldings, pass2Window)
    // Merge pass2 only onto current merge result as "previous"
    merge = mergeHoldingNews(merge.news, incoming2, symbols)
    // Widest window for metadata
    windowFrom = pass2Window.fromDate
    windowTo = pass2Window.toDate
  }

  const nowIso = new Date().toISOString()
  const nextRefreshAt = buildNextRefreshAt()
  const previousImpact = previousStored?.impact ?? {}
  const previousContentFetchedAt =
    previousStored?.contentFetchedAt ?? previousRow?.createdAt ?? nowIso

  const impact: Record<string, HoldingNewsImpactEntry> = {}
  for (const symbol of symbols) {
    if (
      !merge.changedSymbols.includes(symbol) &&
      previousImpact[symbol] &&
      symbolHasBullets(merge.news[symbol])
    ) {
      impact[symbol] = previousImpact[symbol]
    }
  }

  if (merge.changedSymbols.length > 0) {
    const changedHoldings = holdings.filter(h =>
      merge.changedSymbols.includes(h.symbol)
    )
    const newsForImpact: Record<string, string[]> = {}
    for (const s of merge.changedSymbols) {
      newsForImpact[s] = merge.news[s] ?? []
    }
    const freshImpact = await analyzeNewsImpact(newsForImpact, changedHoldings)
    Object.assign(impact, freshImpact)
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

async function liveSearchNews(
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
