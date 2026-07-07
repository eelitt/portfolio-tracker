'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from './users'

/**
 * AI-related Supabase database actions.
 * These are used for rate limiting and storing the latest result per feature type.
 */

export async function getLastAICallTime(userId: string): Promise<Date | null> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('last_ai_call_at')
    .eq('id', userId)
    .single()

  return profile?.last_ai_call_at ? new Date(profile.last_ai_call_at) : null
}

export async function updateLastAICallTime(userId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('profiles')
    .update({ last_ai_call_at: new Date().toISOString() })
    .eq('id', userId)
}

export async function saveAIInsight(
  userId: string,
  featureType: string,
  result: Record<string, any>
): Promise<void> {
  const supabase = await createClient()

  // Keep only the latest per user per feature_type
  await supabase
    .from('user_ai_insights')
    .delete()
    .eq('user_id', userId)
    .eq('feature_type', featureType)

  await supabase.from('user_ai_insights').insert({
    user_id: userId,
    feature_type: featureType,
    result
  })
}

/**
 * Retrieves the latest stored AI insight for a user and specific feature type.
 * Returns { result, createdAt } or null if none exists.
 * createdAt can be used to display cache age.
 */
export async function getLatestAIInsight(
  userId: string,
  featureType: string
): Promise<{ result: Record<string, any>; createdAt: string } | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('user_ai_insights')
    .select('result, created_at')
    .eq('user_id', userId)
    .eq('feature_type', featureType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    result: data.result,
    createdAt: data.created_at,
  }
}

/**
 * Convenience wrapper that gets the current user and retrieves their
 * latest stored AI insight for a feature type (without triggering generation).
 * Returns the same shape as getLatestAIInsight or null.
 */
export async function getLatestAIInsightForCurrentUser(
  featureType: string
): Promise<{ result: Record<string, any>; createdAt: string } | null> {
  const user = await getCurrentUser()
  if (!user) return null
  return getLatestAIInsight(user.id, featureType)
}
