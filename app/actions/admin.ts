'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { buildAdminAccessEvent } from '@/lib/adminAccessEvent'
import { requireAdmin } from '@/lib/requireAdmin'
import { readAiUsageSnapshot } from '@/lib/aiUsage/allowance'
import {
  DEFAULT_AI_ALLOWANCE_USD,
  parseAllowanceUsd,
} from '@/lib/aiUsage/decide'

export interface AdminUserRow {
  id: string
  email: string
  admin: boolean
  accessToApp: boolean
  createdAt: string | null
  /** Estimated product spend in the current window. Null when the meter could not be read. */
  windowSpentUsd: number | null
  allowanceUsd: number
}

export interface AdminAccessEventRow {
  id: string
  createdAt: string
  actorId: string
  targetUserId: string
  previousAdmin: boolean
  nextAdmin: boolean
  previousAccess: boolean
  nextAccess: boolean
}

/**
 * List all auth users joined with profile admin flags (service role).
 */
export async function listUsersForAdmin(): Promise<{
  data?: AdminUserRow[]
  events?: AdminAccessEventRow[]
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

    const snapshots = await Promise.all(
      authUsers.map((u) => readAiUsageSnapshot(u.id))
    )
    const spendById = new Map(
      authUsers.map((u, i) => [u.id, snapshots[i]] as const)
    )

    const rows: AdminUserRow[] = authUsers
      .map((u) => {
        const flags = flagsById.get(u.id)
        const spend = spendById.get(u.id)
        return {
          id: u.id,
          email: u.email ?? '(no email)',
          admin: flags?.admin ?? false,
          accessToApp: flags?.accessToApp ?? false,
          createdAt: u.created_at ?? null,
          windowSpentUsd: spend ? spend.window.estimatedUsd : null,
          allowanceUsd: spend?.allowanceUsd ?? DEFAULT_AI_ALLOWANCE_USD,
        }
      })
      .sort((a, b) => a.email.localeCompare(b.email))

    const { data: eventRows, error: eventsError } = await service
      .from('admin_access_events')
      .select(
        'id, created_at, actor_id, target_user_id, previous_admin, next_admin, previous_access, next_access'
      )
      .order('created_at', { ascending: false })
      .limit(20)

    if (eventsError) {
      console.error('admin_access_events read failed:', eventsError.message)
    }

    const events: AdminAccessEventRow[] = (eventRows ?? []).map((row) => ({
      id: row.id as string,
      createdAt: row.created_at as string,
      actorId: row.actor_id as string,
      targetUserId: row.target_user_id as string,
      previousAdmin: row.previous_admin === true,
      nextAdmin: row.next_admin === true,
      previousAccess: row.previous_access === true,
      nextAccess: row.next_access === true,
    }))

    return { data: rows, events }
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

    const { error: auditError } = await service.from('admin_access_events').insert(
      buildAdminAccessEvent({
        actorId: gate.user.id,
        targetUserId: userId,
        previousAdmin: existing?.admin === true,
        nextAdmin: nextAdmin,
        previousAccess: existing?.access_to_app === true,
        nextAccess,
      })
    )

    if (auditError) {
      console.error('admin_access_events insert failed:', auditError.message)
      return {
        error:
          'Access flags were saved, but the audit row was not. Apply the admin_access_events migration.',
      }
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
        windowSpentUsd: null,
        allowanceUsd: DEFAULT_AI_ALLOWANCE_USD,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user'
    return { error: message }
  }
}

export async function updateUserAiAllowance(input: {
  userId: string
  allowanceUsd?: number
  resetPeriod?: boolean
}): Promise<{ error?: string }> {
  const gate = await requireAdmin()
  if (gate.error || !gate.user) return { error: gate.error ?? 'Not authenticated' }
  if (!input.userId) return { error: 'User id is required' }

  const nextAllowance =
    input.allowanceUsd === undefined ? null : parseAllowanceUsd(input.allowanceUsd)
  if (input.allowanceUsd !== undefined && nextAllowance == null) {
    return { error: 'Allowance must be zero or greater.' }
  }
  if (nextAllowance == null && input.resetPeriod !== true) {
    return { error: 'No changes provided' }
  }

  try {
    const service = createServiceClient()
    const { data: existing, error: readError } = await service
      .from('profiles')
      .select('admin, ai_allowance_usd, period_started_at')
      .eq('id', input.userId)
      .maybeSingle()

    if (readError || !existing) {
      return { error: readError?.message ?? 'User profile was not found.' }
    }
    if (existing.admin === true) {
      return { error: 'Admins have no allowance cap.' }
    }

    const previousAllowance = Number(existing.ai_allowance_usd)
    const previousPeriod = existing.period_started_at as string
    const allowanceUsd = nextAllowance ?? previousAllowance
    const periodStartedAt =
      input.resetPeriod === true ? new Date().toISOString() : previousPeriod

    if (
      allowanceUsd === previousAllowance &&
      periodStartedAt === previousPeriod
    ) {
      return { error: 'No changes provided' }
    }

    const { error: updateError } = await service
      .from('profiles')
      .update({
        ai_allowance_usd: allowanceUsd,
        period_started_at: periodStartedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId)

    if (updateError) return { error: updateError.message }

    const { error: auditError } = await service
      .from('admin_ai_allowance_events')
      .insert({
        actor_id: gate.user.id,
        target_user_id: input.userId,
        previous_allowance_usd: previousAllowance,
        next_allowance_usd: allowanceUsd,
        previous_period_started_at: previousPeriod,
        next_period_started_at: periodStartedAt,
      })

    if (auditError) {
      console.error('admin_ai_allowance_events insert failed:', auditError.message)
      return {
        error:
          'Allowance was saved, but the audit row was not. Apply the AI allowance migration.',
      }
    }

    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update allowance'
    return { error: message }
  }
}
