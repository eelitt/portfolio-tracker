/**
 * Soft rate limit for Portfolio Analyst chat (separate from global last_ai_call_at).
 * Stored in user_ai_insights feature_type portfolio_analyst_rate — no schema migration.
 *
 * Not a "use server" module: only imported by the API route (server-only).
 * Constants + helpers must not live under 'use server' export rules.
 */

import {
  getLatestAIInsight,
  saveAIInsight,
} from '@/app/actions/ai/storage'
import { analystRateLimitError } from '@/lib/analystRateCopy'
import { consumeUserSlot } from '@/lib/consumeUserSlot'
import { isCurrentUserAdmin } from '@/lib/user'

const FEATURE_TYPE = 'portfolio_analyst_rate'

/** Max user messages per rolling window. */
const ANALYST_MAX_MESSAGES = 30
/** Rolling window length (ms). */
const ANALYST_WINDOW_MS = 15 * 60 * 1000
/** Minimum gap between messages (ms). */
const ANALYST_MIN_GAP_MS = 2000

export type AnalystRateLimitResult =
  | { allowed: true }
  | { allowed: false; error: string }

type RateState = {
  windowStart: string
  messageCount: number
  lastMessageAt: string
}

function parseState(result: Record<string, unknown> | undefined): RateState | null {
  if (!result) return null
  const windowStart = result.windowStart
  const messageCount = result.messageCount
  const lastMessageAt = result.lastMessageAt
  if (
    typeof windowStart !== 'string' ||
    typeof messageCount !== 'number' ||
    typeof lastMessageAt !== 'string'
  ) {
    return null
  }
  return { windowStart, messageCount, lastMessageAt }
}

/**
 * Check and consume one message slot for the analyst chat.
 * Call once per user message (not per tool step).
 */
export async function checkAndConsumeAnalystRateLimit(
  userId: string
): Promise<AnalystRateLimitResult> {
  // Admins skip message caps / min-gap (testing; still require auth at the route).
  // isCurrentUserAdmin reuses request-cached profile (no extra getUser+select pair).
  if (await isCurrentUserAdmin()) {
    return { allowed: true }
  }

  const slot = await consumeUserSlot({
    slot: 'portfolio_analyst_rate',
    windowMs: ANALYST_WINDOW_MS,
    max: ANALYST_MAX_MESSAGES,
    minGapMs: ANALYST_MIN_GAP_MS,
  })
  if (slot.status === 'allowed') return { allowed: true }
  if (slot.status === 'denied') {
    return {
      allowed: false,
      error: analystRateLimitError(slot.reason, slot.retryAfterMs),
    }
  }

  return consumeAnalystRateLimitFallback(userId)
}

/** Used only when consume_user_slot is not in the database yet. */
async function consumeAnalystRateLimitFallback(
  userId: string
): Promise<AnalystRateLimitResult> {
  const now = Date.now()
  const cached = await getLatestAIInsight(userId, FEATURE_TYPE)
  const prev = parseState(cached?.result)

  if (prev) {
    const lastAt = new Date(prev.lastMessageAt).getTime()
    if (Number.isFinite(lastAt)) {
      const gap = now - lastAt
      if (gap < ANALYST_MIN_GAP_MS) {
        return {
          allowed: false,
          error: analystRateLimitError('gap', ANALYST_MIN_GAP_MS - gap),
        }
      }
    }

    const windowStartMs = new Date(prev.windowStart).getTime()
    const inWindow =
      Number.isFinite(windowStartMs) && now - windowStartMs < ANALYST_WINDOW_MS

    if (inWindow && prev.messageCount >= ANALYST_MAX_MESSAGES) {
      return {
        allowed: false,
        error: analystRateLimitError(
          'window',
          ANALYST_WINDOW_MS - (now - windowStartMs)
        ),
      }
    }

    const next: RateState = inWindow
      ? {
          windowStart: prev.windowStart,
          messageCount: prev.messageCount + 1,
          lastMessageAt: new Date(now).toISOString(),
        }
      : {
          windowStart: new Date(now).toISOString(),
          messageCount: 1,
          lastMessageAt: new Date(now).toISOString(),
        }

    await saveAIInsight(userId, FEATURE_TYPE, next)
    return { allowed: true }
  }

  const next: RateState = {
    windowStart: new Date(now).toISOString(),
    messageCount: 1,
    lastMessageAt: new Date(now).toISOString(),
  }
  await saveAIInsight(userId, FEATURE_TYPE, next)
  return { allowed: true }
}
