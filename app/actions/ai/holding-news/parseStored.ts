import {
  holdingNewsSchema,
  holdingNewsImpactEntrySchema,
  holdingNewsStoredSchema,
  type HoldingNewsImpactEntry,
  type HoldingNewsStored,
} from '@/lib/schemas'
import type { HoldingNewsSuccessResult } from './constants'

function parseImpactMap(raw: unknown): Record<string, HoldingNewsImpactEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, HoldingNewsImpactEntry> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = holdingNewsImpactEntrySchema.safeParse(value)
    if (parsed.success) {
      out[key.toUpperCase().trim() || key] = parsed.data
    }
  }
  return out
}

/**
 * Parse user_ai_insights.result for holding_news into a typed package.
 * Returns null if news is missing/unusable. Soft-filters bad impact entries.
 */
export function parseHoldingNewsStored(
  raw: unknown,
  rowCreatedAt: string
): HoldingNewsStored | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const obj = raw as Record<string, unknown>
  const impact = parseImpactMap(obj.impact)

  const result = holdingNewsStoredSchema.safeParse({
    ...obj,
    impact,
  })
  if (!result.success) {
    const newsOnly = holdingNewsSchema.safeParse({ news: obj.news })
    if (!newsOnly.success) return null
    return {
      news: newsOnly.data.news,
      impact,
      windowFrom: typeof obj.windowFrom === 'string' ? obj.windowFrom : undefined,
      windowTo: typeof obj.windowTo === 'string' ? obj.windowTo : undefined,
      contentFetchedAt:
        typeof obj.contentFetchedAt === 'string'
          ? obj.contentFetchedAt
          : typeof obj.fetchedAt === 'string'
            ? obj.fetchedAt
            : rowCreatedAt,
      lastCheckedAt:
        typeof obj.lastCheckedAt === 'string' ? obj.lastCheckedAt : rowCreatedAt,
      fetchedAt: typeof obj.fetchedAt === 'string' ? obj.fetchedAt : undefined,
    }
  }

  const stored = result.data
  return {
    ...stored,
    impact: stored.impact ?? impact,
    contentFetchedAt:
      stored.contentFetchedAt ?? stored.fetchedAt ?? rowCreatedAt,
    lastCheckedAt: stored.lastCheckedAt ?? rowCreatedAt,
  }
}

export function toCooldownResult(
  stored: HoldingNewsStored,
  opts: { message: string; nextRefreshAt: string }
): HoldingNewsSuccessResult {
  const contentFetchedAt = stored.contentFetchedAt!
  const lastCheckedAt = stored.lastCheckedAt!
  const impact =
    stored.impact && Object.keys(stored.impact).length > 0
      ? stored.impact
      : undefined

  return {
    news: stored.news,
    impact,
    contentFetchedAt,
    lastCheckedAt,
    cachedAt: contentFetchedAt,
    windowFrom: stored.windowFrom,
    windowTo: stored.windowTo,
    nextRefreshAt: opts.nextRefreshAt,
    message: opts.message,
  }
}
