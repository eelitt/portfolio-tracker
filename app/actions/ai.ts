'use server'

import { createClient } from '@/lib/supabase/server'

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
