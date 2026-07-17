/**
 * Persist a holding-news package to user_ai_insights.
 * Does not bump profiles.last_ai_call_at — caller decides when to rate-limit globally.
 */

import { saveAIInsight } from '@/app/actions/ai/storage'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { HOLDING_NEWS_FEATURE_TYPE } from './newsUtils'

export type HoldingNewsPackage = {
  news: Record<string, string[]>
  impact: Record<string, HoldingNewsImpactEntry>
  windowFrom: string
  windowTo: string
  contentFetchedAt: string
  lastCheckedAt: string
}

/**
 * Upsert the single holding_news row for this user.
 * Writes legacy `fetchedAt` (= lastCheckedAt) for older readers.
 */
export async function saveHoldingNewsPackage(
  userId: string,
  pkg: HoldingNewsPackage
): Promise<void> {
  await saveAIInsight(userId, HOLDING_NEWS_FEATURE_TYPE, {
    news: pkg.news,
    impact: pkg.impact,
    windowFrom: pkg.windowFrom,
    windowTo: pkg.windowTo,
    contentFetchedAt: pkg.contentFetchedAt,
    lastCheckedAt: pkg.lastCheckedAt,
    fetchedAt: pkg.lastCheckedAt,
  })
}
