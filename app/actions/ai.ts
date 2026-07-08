'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from './users'

/**
 * AI-related Supabase database actions.
 * Used for rate limiting and storing the latest AI result per feature type.
 */

// ============================================
// RATE LIMITING (stored in profiles table)
// ============================================

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
    .upsert(
      {
        id: userId,
        last_ai_call_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
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
  result: Record<string, any>
): Promise<void> {
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
): Promise<{ result: Record<string, any>; createdAt: string } | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('user_ai_insights')
    .select('result, created_at')
    .eq('user_id', userId)
    .eq('feature_type', featureType)
    .maybeSingle()

  if (!data) return null

  return {
    result: data.result,
    createdAt: data.created_at,
  }
}

/**
 * Convenience function: Get latest AI insight for the currently logged-in user.
 */
export async function getLatestAIInsightForCurrentUser(
  featureType: string
): Promise<{ result: Record<string, any>; createdAt: string } | null> {
  const user = await getCurrentUser()
  if (!user) return null

  return getLatestAIInsight(user.id, featureType)
}