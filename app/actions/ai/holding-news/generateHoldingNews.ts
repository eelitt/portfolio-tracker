'use server'

import { getCurrentUser } from '@/app/actions/users'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
import {
  updateLastAICallTime,
  saveAIInsight,
  getLatestAIInsight,
} from '@/app/actions/ai/storage'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { callXaiResponsesWithSearch } from './xaiLiveSearch'
import { analyzeNewsImpact } from './analyzeImpact'
import {
  HOLDING_NEWS_COOLDOWN_MS,
  HOLDING_NEWS_FEATURE_TYPE,
  type CachedInsight,
  computeNewsWindow,
  selectHoldingsForNews,
  parseHoldingNewsJson,
  normalizeHoldingNews,
} from './newsUtils'

export type HoldingNewsResult =
  | {
      news: Record<string, string[]>
      impact?: Record<string, HoldingNewsImpactEntry>
      cachedAt?: string
      message?: string
      nextRefreshAt?: string
      windowFrom?: string
      windowTo?: string
      error?: undefined
    }
  | { error: string; news?: undefined; impact?: undefined }

function parseCachedImpact(
  raw: unknown
): Record<string, HoldingNewsImpactEntry> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  return raw as Record<string, HoldingNewsImpactEntry>
}

/**
 * Fetch live holding news (web + X) for the user's top holdings,
 * then synthesize impact analysis (fail-open).
 * At most one successful live fetch per 24h; returns cache when rate-limited.
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

    if (cached?.result?.news) {
      const lastFetched = new Date(cached.createdAt).getTime()
      const elapsed = Date.now() - lastFetched
      const newsMap = cached.result.news as Record<string, string[]>
      const hasAnyBullet = Object.values(newsMap).some(
        bullets => Array.isArray(bullets) && bullets.length > 0
      )
      // Legacy pre-live-search rows lack windowFrom; allow one free re-fetch so users
      // stuck with empty model-memory results are not locked out for 24h.
      const isLiveSearchResult = typeof cached.result.windowFrom === 'string'
      const shouldEnforceCooldown = isLiveSearchResult && hasAnyBullet

      if (elapsed < HOLDING_NEWS_COOLDOWN_MS && shouldEnforceCooldown) {
        const nextRefreshAt = new Date(lastFetched + HOLDING_NEWS_COOLDOWN_MS).toISOString()
        const hoursLeft = Math.max(
          1,
          Math.ceil((HOLDING_NEWS_COOLDOWN_MS - elapsed) / (60 * 60 * 1000))
        )
        return {
          news: newsMap,
          impact: parseCachedImpact(cached.result.impact),
          cachedAt: cached.createdAt,
          nextRefreshAt,
          windowFrom:
            typeof cached.result.windowFrom === 'string'
              ? cached.result.windowFrom
              : undefined,
          windowTo:
            typeof cached.result.windowTo === 'string' ? cached.result.windowTo : undefined,
          message: `Showing cached news. Next refresh available in ~${hoursLeft}h.`,
        }
      }
    }

    const windowBase: CachedInsight | null =
      cached && typeof cached.result.windowFrom === 'string' ? cached : null

    return await runLiveHoldingNewsFetch(user.id, data, windowBase)
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

async function runLiveHoldingNewsFetch(
  userId: string,
  data: PortfolioData,
  cached: CachedInsight | null
): Promise<HoldingNewsResult> {
  const holdings = selectHoldingsForNews(data)
  if (holdings.length === 0) {
    return { error: 'No non-cash holdings to fetch news for.' }
  }

  const symbols = holdings.map(h => h.symbol)
  const { fromDate, toDate, lookbackDays } = computeNewsWindow(
    cached?.createdAt ? new Date(cached.createdAt) : null
  )

  const holdingsSummary = holdings
    .map(h => `- ${h.symbol} (${h.assetType}) — ${h.name}`)
    .join('\n')

  const system = `You are a financial news assistant with live web and X search tools.
For each holding, use the tools to find material, price-relevant news or official announcements in the given date range only.
Rules:
- Prefer reputable web sources; use X for official company/project posts and major announcements.
- Max 3 short bullet points per holding (one sentence each).
- Be factual. Do not invent events. If nothing material is found for a holding, return an empty array for that symbol.
- Keys MUST be the exact ticker symbols provided (uppercase), never company names alone.
- Respond with ONLY valid JSON matching this shape (no markdown fences, no extra text):
{"news":{"SYMBOL":["bullet1","bullet2"]}}`

  const prompt = `Date range (inclusive): ${fromDate} to ${toDate} (last ${lookbackDays} day(s)).

Holdings to cover:
${holdingsSummary}

Search for main news items in this window for each holding. Return JSON with a "news" object keyed by ticker.`

  const rawText = await callXaiResponsesWithSearch({
    system,
    prompt,
    fromDate,
    toDate,
  })

  const parsed = parseHoldingNewsJson(rawText)
  const news = normalizeHoldingNews(parsed, symbols)

  // Impact is a sub-step: fail-open so news still saves if analysis fails.
  const impact = await analyzeNewsImpact(news, holdings)

  const resultToStore: Record<string, unknown> = {
    news,
    impact,
    windowFrom: fromDate,
    windowTo: toDate,
    fetchedAt: new Date().toISOString(),
  }
  await saveAIInsight(userId, HOLDING_NEWS_FEATURE_TYPE, resultToStore)
  await updateLastAICallTime(userId)

  const nextRefreshAt = new Date(Date.now() + HOLDING_NEWS_COOLDOWN_MS).toISOString()

  return {
    news,
    impact: Object.keys(impact).length > 0 ? impact : undefined,
    windowFrom: fromDate,
    windowTo: toDate,
    nextRefreshAt,
  }
}
