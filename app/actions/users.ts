'use server'

import { createClient } from '@/lib/supabase/server'

export type PreferredCurrency = 'USD' | 'EUR'

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export interface UserProfile {
  id: string
  email?: string
  preferredCurrency: PreferredCurrency
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('preferred_currency')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email,
    preferredCurrency: (profile?.preferred_currency as PreferredCurrency) || 'USD',
  }
}

export async function updatePreferredCurrency(currency: PreferredCurrency) {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        preferred_currency: currency,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}