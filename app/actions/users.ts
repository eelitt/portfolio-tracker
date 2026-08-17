'use server'

/**
 * User-related Server Actions only (async exports).
 * Loaders/types live in lib/user.ts and lib/userTypes.ts.
 */

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentUserProfile } from '@/lib/user'
import { changePasswordSchema, investorProfileSchema } from '@/lib/schemas'
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

  // Display currency only — do not bust live price cache (quotes are USD/USDT).
  // Busting `prices` forced origin re-fetches on every toggle and could
  // thrash the free tier, showing "0 of N assets" despite good prior quotes.
  revalidatePath('/dashboard')
  return { success: true }
}

export async function getInvestorProfile() {
  const profile = await getCurrentUserProfile()
  if (!profile) return { error: 'Not authenticated' as const }
  return {
    data: {
      ageBand: profile.ageBand,
      horizon: profile.horizon,
      riskTolerance: profile.riskTolerance,
      monthlyContribution: profile.monthlyContribution,
    },
  }
}

export async function updateInvestorProfile(input: {
  ageBand?: string | null
  horizon?: string | null
  riskTolerance?: string | null
  monthlyContribution?: string | null
}): Promise<{ success: true } | { error: string }> {
  const parsed = investorProfileSchema.safeParse({
    ageBand: input.ageBand || null,
    horizon: input.horizon || null,
    riskTolerance: input.riskTolerance || null,
    monthlyContribution: input.monthlyContribution || null,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid investor profile' }
  }

  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      age_band: parsed.data.ageBand ?? null,
      horizon: parsed.data.horizon ?? null,
      risk_tolerance: parsed.data.riskTolerance ?? null,
      monthly_contribution: parsed.data.monthlyContribution ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

/**
 * Change password for the signed-in user.
 * Re-verifies current password, then updates via Supabase Auth.
 */
export async function changePassword(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<{ success: true } | { error: string }> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid password form',
    }
  }

  const user = await getCurrentUser()
  if (!user?.email) {
    return { error: 'Please log in again' }
  }

  const supabase = await createClient()
  const { currentPassword, newPassword } = parsed.data

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (reauthError) {
    return { error: 'Current password is incorrect' }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    const msg = (updateError.message || '').toLowerCase()
    if (msg.includes('same password') || msg.includes('should be different')) {
      return { error: 'New password must be different from current password' }
    }
    if (msg.includes('at least') || msg.includes('weak') || msg.includes('password')) {
      return { error: 'Password does not meet requirements. Use at least 8 characters.' }
    }
    console.error('changePassword updateUser error:', updateError.message)
    return { error: 'Could not update password. Try again.' }
  }

  return { success: true }
}
