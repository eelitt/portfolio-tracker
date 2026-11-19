'use server'

import { createClient } from '@/lib/supabase/server'
import { aiCooldownOrFilter } from '@/lib/aiCooldown'
import { getCurrentUser } from '@/lib/user'

const AI_COOLDOWN_MS = 60_000

/**
 * AI-related Supabase database actions.
 * Used for rate limiting and storing the latest AI result per feature type.
 *
 * All helpers take userId for call-site clarity but refuse to read/write unless
 * userId matches the authenticated session (defense-in-depth with RLS).
 */

async function assertSessionUser(userId: string): Promise<boolean> {
  const user = await getCurrentUser()
  return !!user && user.id === userId
}

// ============================================
// RATE LIMITING (stored in profiles table)
// ============================================

/**
 * Take the shared 60s AI slot in one update.
 * Zero rows means another request already took it, or the caller is not this user.
 */
export async function tryConsumeAiCooldown(userId: string): Promise<
  { allowed: true } | { allowed: false; retryAfterSeconds: number }
> {
  if (!(await assertSessionUser(userId))) {
    return { allowed: false, retryAfterSeconds: 60 }
  }

  const supabase = await createClient()
  const nowIso = new Date().toISOString()
  const cutoff = new Date(Date.now() - AI_COOLDOWN_MS).toISOString()
  const { data, error } = await supabase
    .from('profiles')
    .update({
      last_ai_call_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', userId)
    .or(aiCooldownOrFilter(cutoff))
    .select('id')

  if (error) {
    console.error('AI cooldown update failed:', error.message)
    return { allowed: false, retryAfterSeconds: 60 }
  }
  if (data && data.length > 0) return { allowed: true }

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_ai_call_at')
    .eq('id', userId)
    .maybeSingle()
  const last = profile?.last_ai_call_at
    ? new Date(profile.last_ai_call_at).getTime()
    : NaN
  const retryAfterSeconds = Number.isFinite(last)
    ? Math.max(1, Math.ceil((AI_COOLDOWN_MS - (Date.now() - last)) / 1000))
    : 60
  return { allowed: false, retryAfterSeconds }
}

// ============================================
// AI INSIGHTS STORAGE (user_ai_insights table)
// ============================================

/**
 * Save or update the latest AI result for a specific feature type.
 * Uses upsert so we only keep the latest result per user + feature_type.
 */
export async function saveAIInsight(
  userId: string,
  featureType: string,
  result: Record<string, unknown>
): Promise<void> {
  if (!(await assertSessionUser(userId))) return

  const supabase = await createClient()

  await supabase.from('user_ai_insights').upsert(
    {
      user_id: userId,
      feature_type: featureType,
      result,
      created_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,feature_type',
    }
  )
}

/**
 * Get the latest stored AI insight for a user and specific feature type.
 */
export async function getLatestAIInsight(
  userId: string,
  featureType: string
): Promise<{ result: Record<string, unknown>; createdAt: string } | null> {
  if (!(await assertSessionUser(userId))) return null

  const supabase = await createClient()

  const { data } = await supabase
    .from('user_ai_insights')
    .select('result, created_at')
    .eq('user_id', userId)
    .eq('feature_type', featureType)
    .maybeSingle()

  if (!data) return null

  return {
    result: data.result as Record<string, unknown>,
    createdAt: data.created_at,
  }
}

/**
 * Convenience function: Get latest AI insight for the currently logged-in user.
 */
export async function getLatestAIInsightForCurrentUser(
  featureType: string
): Promise<{ result: Record<string, unknown>; createdAt: string } | null> {
  const user = await getCurrentUser()
  if (!user) return null

  return getLatestAIInsight(user.id, featureType)
}
