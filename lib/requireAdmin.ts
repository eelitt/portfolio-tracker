/**
 * Admin gate for Server Actions. One check: session user, then profiles.admin.
 */

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/user'

export async function requireAdmin(): Promise<
  | { user: { id: string; email?: string }; error?: undefined }
  | { user?: undefined; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.admin !== true) {
    return { error: 'Admin access required' }
  }

  return { user: { id: user.id, email: user.email } }
}
