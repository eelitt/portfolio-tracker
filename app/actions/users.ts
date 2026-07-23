'use server'

/**
 * User-related Server Actions only (async exports).
 * Loaders/types live in lib/user.ts and lib/userTypes.ts.
 */

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserProfile } from '@/lib/user'
import {
  APP_ACCESS_DENIED_MESSAGE,
  type PreferredCurrency,
} from '@/lib/userTypes'

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
