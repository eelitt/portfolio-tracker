import type { HoldingNewsImpactEntry } from '@/lib/schemas'

/** Minimum gap between live news fetches per user (same row is reused as cache). */
export const HOLDING_NEWS_COOLDOWN_MS = 24 * 60 * 60 * 1000

/** Cap on how far back we search / ask the model to cover (first fetch and max re-fetch). */
export const HOLDING_NEWS_MAX_LOOKBACK_DAYS = 7

/**
 * One-shot extended lookback for first-time holdings that return empty after the 7d pass.
 * Does not apply to symbols that already had news or were covered as empty.
 */
export const HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS = 14

/**
 * Only the largest positions get news (cost control).
 * Smaller holdings are omitted from the LLM prompt and result keys.
 */
export const HOLDING_NEWS_MAX_HOLDINGS = 6

/** user_ai_insights.feature_type value for this feature (one row per user). */
export const HOLDING_NEWS_FEATURE_TYPE = 'holding_news'

/** Separate row + 24h cooldown from holding news. */
export const WATCHLIST_NEWS_FEATURE_TYPE = 'watchlist_news'

export function newsFeatureType(
  universe: 'holdings' | 'watchlist' | undefined
): string {
  return universe === 'watchlist'
    ? WATCHLIST_NEWS_FEATURE_TYPE
    : HOLDING_NEWS_FEATURE_TYPE
}

/** Shape returned by getLatestAIInsight for holding_news (and similar). */
export type CachedInsight = { result: Record<string, unknown>; createdAt: string }

/**
 * Success payload returned to the client (cooldown, no-op keep, or fresh update).
 */
export type HoldingNewsSuccessResult = {
  news: Record<string, string[]>
  impact?: Record<string, HoldingNewsImpactEntry>
  contentFetchedAt?: string
  lastCheckedAt?: string
  cachedAt?: string
  message?: string
  nextRefreshAt?: string
  windowFrom?: string
  windowTo?: string
  error?: undefined
}

/** ISO timestamp for next allowed live fetch (fromMs + cooldown). */
export function buildNextRefreshAt(fromMs: number = Date.now()): string {
  return new Date(fromMs + HOLDING_NEWS_COOLDOWN_MS).toISOString()
}
