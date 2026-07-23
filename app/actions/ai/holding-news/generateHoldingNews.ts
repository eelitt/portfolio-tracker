'use server'

/**
 * Holding News server action — public entry for the sidebar / AI Insights UI.
 *
 * Flow:
 *  1. Auth + portfolio + XAI_API_KEY checks
 *  2. Load cached user_ai_insights row (feature_type holding_news)
 *  3. If last check < 24h and result looks valid → return cache (no LLM)
 *  4. Else live search (7d window if any symbol never had news; else elapsed lookback)
 *     → per-symbol merge (first fill vs keep vs update)
 *     → impact only for changed symbols
 *  5. Upsert via saveHoldingNewsPackage
 *
 * Cooldown is holding-news specific (lastCheckedAt).
 */

import { getCurrentUser, isCurrentUserAdmin } from '@/app/actions/users'
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
  HOLDING_NEWS_FEATURE_TYPE,
  type CachedInsight,
  type HoldingNewsSuccessResult,
  computeNewsWindow,
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
} from './newsUtils'

/** Discriminated result for useHoldingNews (success fields vs error). */
export type HoldingNewsResult =
  | HoldingNewsSuccessResult
  | { error: string; news?: undefined; impact?: undefined }

/**
 * Fetch live holding news for the user's top holdings, then impact analysis.
 * At most one successful live check per 24h; per-symbol keep/first-fill/update merge.
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

    // --- 24h cooldown (live-search caches with content; admins skip) ---
    if (!(await isCurrentUserAdmin()) && cached && stored && newsHasAnyBullets(stored.news)) {
      const lastCheck = Date.parse(stored.lastCheckedAt ?? cached.createdAt)
      const elapsed = Date.now() - lastCheck
      const isLiveSearchResult = typeof stored.windowFrom === 'string'
      const shouldEnforceCooldown = isLiveSearchResult && newsHasAnyBullets(stored.news)

      if (elapsed < HOLDING_NEWS_COOLDOWN_MS && shouldEnforceCooldown && !Number.isNaN(lastCheck)) {
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

    return await runLiveHoldingNewsFetch(user.id, data, windowBase, cached, stored)
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
 * One live pipeline: window → search → per-symbol merge → selective impact → persist.
 */
async function runLiveHoldingNewsFetch(
  userId: string,
  data: PortfolioData,
  windowBase: CachedInsight | null,
  previousRow: CachedInsight | null,
  previousStored: ReturnType<typeof parseHoldingNewsStored>
): Promise<HoldingNewsResult> {
  const holdings = selectHoldingsForNews(data)
  if (holdings.length === 0) {
    return { error: 'No non-cash holdings to fetch news for.' }
  }

  const symbols = holdings.map(h => h.symbol)
  const previousNews = previousStored?.news ?? null

  // Any selected symbol without prior bullets → full 7d baseline window
  const needsBaseline = symbols.some(s => !symbolHasBullets(previousNews?.[s]))
  const lookbackFrom =
    !needsBaseline && windowBase && previousStored
      ? new Date(previousStored.lastCheckedAt ?? windowBase.createdAt)
      : null
  const { fromDate, toDate, lookbackDays } = computeNewsWindow(lookbackFrom)

  const holdingsSummary = holdings
    .map(h => `- ${h.symbol} (${h.assetType}) — ${h.name}`)
    .join('\n')

  const rawText = await callXaiResponsesWithSearch({
    system: buildHoldingNewsSystemPrompt(),
    prompt: buildHoldingNewsUserPrompt({
      fromDate,
      toDate,
      lookbackDays,
      holdingsSummary,
    }),
    fromDate,
    toDate,
  })

  const parsed = parseHoldingNewsJson(rawText)
  const incoming = normalizeHoldingNews(parsed, symbols)
  const merge = mergeHoldingNews(previousNews, incoming, symbols)

  const nowIso = new Date().toISOString()
  const nextRefreshAt = buildNextRefreshAt()
  const previousImpact = previousStored?.impact ?? {}
  const previousContentFetchedAt =
    previousStored?.contentFetchedAt ?? previousRow?.createdAt ?? nowIso

  // Carry forward impact for kept symbols; recompute only for first-fill / updates
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
  const message = buildHoldingNewsMergeMessage(merge)

  await saveHoldingNewsPackage(userId, {
    news: merge.news,
    impact,
    windowFrom: fromDate,
    windowTo: toDate,
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
    windowFrom: fromDate,
    windowTo: toDate,
    nextRefreshAt,
    message,
  }
}
