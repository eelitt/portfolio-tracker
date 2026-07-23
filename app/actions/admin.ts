'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/app/actions/users'

export interface AdminUserRow {
  id: string
  email: string
  admin: boolean
  accessToApp: boolean
  createdAt: string | null
}

async function requireAdmin(): Promise<
  { user: { id: string; email?: string }; error?: undefined } | { user?: undefined; error: string }
> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

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

/**
 * List all auth users joined with profile admin flags (service role).
 */
export async function listUsersForAdmin(): Promise<{
  data?: AdminUserRow[]
  error?: string
}> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  try {
    const service = createServiceClient()

    // Paginate auth.admin.listUsers (default page size 50)
    const perPage = 100
    let page = 1
    const authUsers: { id: string; email?: string; created_at?: string }[] = []

    for (;;) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage })
      if (error) {
        return { error: error.message }
      }
      const batch = data?.users ?? []
      authUsers.push(
        ...batch.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
        }))
      )
      if (batch.length < perPage) break
      page += 1
      // Safety cap
      if (page > 50) break
    }

    const { data: profiles, error: profilesError } = await service
      .from('profiles')
      .select('id, admin, access_to_app')

    if (profilesError) {
      return { error: profilesError.message }
    }

    const flagsById = new Map(
      (profiles ?? []).map((p) => [
        p.id as string,
        {
          admin: p.admin === true,
          accessToApp: p.access_to_app === true,
        },
      ])
    )

    const rows: AdminUserRow[] = authUsers
      .map((u) => {
        const flags = flagsById.get(u.id)
        return {
          id: u.id,
          email: u.email ?? '(no email)',
          admin: flags?.admin ?? false,
          accessToApp: flags?.accessToApp ?? false,
          createdAt: u.created_at ?? null,
        }
      })
      .sort((a, b) => a.email.localeCompare(b.email))

    return { data: rows }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list users'
    return { error: message }
  }
}

export async function updateUserAccessFlags(input: {
  userId: string
  admin?: boolean
  accessToApp?: boolean
}): Promise<{ data?: AdminUserRow; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error || !gate.user) return { error: gate.error ?? 'Not authenticated' }

  const { userId, admin, accessToApp } = input
  if (!userId) {
    return { error: 'User id is required' }
  }
  if (admin === undefined && accessToApp === undefined) {
    return { error: 'No changes provided' }
  }

  // Prevent self-demotion lockout
  if (userId === gate.user.id && admin === false) {
    return { error: 'You cannot remove your own admin access' }
  }

  try {
    const service = createServiceClient()

    const { data: existing } = await service
      .from('profiles')
      .select('id, admin, access_to_app, preferred_currency')
      .eq('id', userId)
      .maybeSingle()

    const nextAdmin = admin !== undefined ? admin : existing?.admin === true
    const nextAccess =
      accessToApp !== undefined ? accessToApp : existing?.access_to_app === true

    const { error: upsertError } = await service.from('profiles').upsert(
      {
        id: userId,
        admin: nextAdmin,
        access_to_app: nextAccess,
        preferred_currency: existing?.preferred_currency ?? 'USD',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (upsertError) {
      return { error: upsertError.message }
    }

    // Resolve email for response (optional convenience)
    const { data: authData } = await service.auth.admin.getUserById(userId)
    const email = authData?.user?.email ?? '(no email)'
    const createdAt = authData?.user?.created_at ?? null

    return {
      data: {
        id: userId,
        email,
        admin: nextAdmin,
        accessToApp: nextAccess,
        createdAt,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user'
    return { error: message }
  }
}
