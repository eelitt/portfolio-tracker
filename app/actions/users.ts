'use server'

import { cache } from 'react'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type PreferredCurrency = 'USD' | 'EUR'

export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export interface UserProfile {
  id: string
  email?: string
  preferredCurrency: PreferredCurrency
  admin: boolean
  accessToApp: boolean
}

/**
 * Session user + profile flags. Request-scoped via React cache() so layout,
 * portfolio loaders, and AI rate-limit checks share one auth + profile query.
 */
export const getCurrentUserProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('preferred_currency, admin, access_to_app')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email,
    preferredCurrency: (profile?.preferred_currency as PreferredCurrency) || 'USD',
    admin: profile?.admin === true,
    accessToApp: profile?.access_to_app === true,
  }
})

/** Admin flag for the current session — reuses getCurrentUserProfile (cached). */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const profile = await getCurrentUserProfile()
  return profile?.admin === true
}

/** Shown when login/session is blocked for missing app access. */
export const APP_ACCESS_DENIED_MESSAGE =
  'Your account does not have access to this app yet. An administrator must approve your account.'

/**
 * After auth: require profiles.access_to_app. Signs out and returns an error if denied.
 * Used at login; layout/middleware are additional gates for revoked sessions.
 */
export async function ensureAppAccess(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const profile = await getCurrentUserProfile()
  if (profile?.accessToApp === true) {
    return { ok: true }
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  return { ok: false, error: APP_ACCESS_DENIED_MESSAGE }
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

  // Align with Refresh Prices: clear any tagged price entries + re-render dashboard
  revalidateTag('prices', { expire: 0 })
  revalidatePath('/dashboard')
  return { success: true }
}
