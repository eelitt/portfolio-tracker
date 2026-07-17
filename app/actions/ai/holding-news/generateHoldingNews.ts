'use server'

/**
 * Holding News server action — public entry for the sidebar / AI Insights UI.
 *
 * Flow:
 *  1. Auth + portfolio + XAI_API_KEY checks
 *  2. Load cached user_ai_insights row (feature_type holding_news)
 *  3. If last check < 24h and result looks valid → return cache (no LLM)
 *  4. Else live search → parse/normalize
 *     - If new package empty/identical vs previous with substance → keep previous
 *       news+impact, set lastCheckedAt, message user (no impact LLM)
 *     - Else → impact analysis, save new contentFetchedAt
 *  5. Upsert via saveHoldingNewsPackage
 *
 * Cooldown is holding-news specific (lastCheckedAt).
 */

import { getCurrentUser } from '@/app/actions/users'
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
  newsContentFingerprint,
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
 * At most one successful live check per 24h; empty/identical re-fetches keep prior news.
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

    // --- 24h cooldown (only for “real” live-search caches with content) ---
    if (cached && stored && newsHasAnyBullets(stored.news)) {
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

    // Lookback window uses last *live* check only (not legacy empty rows)
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
 * One live pipeline: search → parse → maybe keep previous → impact → persist.
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
  const lookbackFrom =
    windowBase && previousStored
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
  const news = normalizeHoldingNews(parsed, symbols)

  const previousNews = previousStored?.news ?? null
  const previousHadContent = newsHasAnyBullets(previousNews)
  const newHasContent = newsHasAnyBullets(news)
  const nowIso = new Date().toISOString()
  const nextRefreshAt = buildNextRefreshAt()

  // --- Keep previous package when re-fetch is empty or essentially unchanged ---
  if (previousStored && previousNews && previousHadContent) {
    const emptyNew = !newHasContent
    const sameContent =
      newHasContent &&
      newsContentFingerprint(previousNews) === newsContentFingerprint(news)

    if (emptyNew || sameContent) {
      const contentFetchedAt =
        previousStored.contentFetchedAt ?? previousRow?.createdAt ?? nowIso
      const previousImpact = previousStored.impact ?? {}

      await saveHoldingNewsPackage(userId, {
        news: previousNews,
        impact: previousImpact,
        windowFrom: fromDate,
        windowTo: toDate,
        contentFetchedAt,
        lastCheckedAt: nowIso,
      })
      await updateLastAICallTime(userId)

      return {
        news: previousNews,
        impact: Object.keys(previousImpact).length > 0 ? previousImpact : undefined,
        contentFetchedAt,
        lastCheckedAt: nowIso,
        cachedAt: contentFetchedAt,
        windowFrom: fromDate,
        windowTo: toDate,
        nextRefreshAt,
        message: emptyNew
          ? 'No material new headlines since last update. Showing your previous news.'
          : 'No significant change since last fetch. Showing your previous news.',
      }
    }
  }

  // Real update: recompute impact and advance contentFetchedAt
  const impact: Record<string, HoldingNewsImpactEntry> = await analyzeNewsImpact(
    news,
    holdings
  )

  await saveHoldingNewsPackage(userId, {
    news,
    impact,
    windowFrom: fromDate,
    windowTo: toDate,
    contentFetchedAt: nowIso,
    lastCheckedAt: nowIso,
  })
  await updateLastAICallTime(userId)

  return {
    news,
    impact: Object.keys(impact).length > 0 ? impact : undefined,
    contentFetchedAt: nowIso,
    lastCheckedAt: nowIso,
    cachedAt: nowIso,
    windowFrom: fromDate,
    windowTo: toDate,
    nextRefreshAt,
  }
}
