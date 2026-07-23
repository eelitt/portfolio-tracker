/**
 * Server-only user/session helpers (not Server Actions).
 * Request-scoped via React cache() so layout + loaders + AI checks share one query.
 * Never import from Client Components — use props or Server Actions instead.
 */

import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { PreferredCurrency, UserProfile } from '@/lib/userTypes'

export type { PreferredCurrency, UserProfile } from '@/lib/userTypes'

export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

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
