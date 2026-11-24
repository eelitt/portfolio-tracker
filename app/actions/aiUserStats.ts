/**
 * Admin Users tab. Dollars come from the allowance snapshot. Counts come from groupUserUsage.
 */

'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { callerLabel } from '@/lib/agentObservability/caller'
import { readAiUsageSnapshot } from '@/lib/aiUsage/allowance'
import {
  AI_USAGE_READ_FAILED_MESSAGE,
  allowanceLeft,
  isEvalMeta,
} from '@/lib/aiUsage/decide'
import { groupUserUsage, type UserStatSource } from '@/lib/aiUsage/userStats'
import { requireAdmin } from '@/lib/requireAdmin'

export type AiUserStatRow = {
  userId: string
  caller: string
  isAdmin: boolean
  periodUsd: number
  allowanceUsd: number
  overUsd: number
  allTimeUsd: number
  evalUsd: number
  calls: number
  mostUsed: { feature: string; count: number } | null
  lastCall: {
    at: string
    feature: string
    status: string
    eval: boolean
  } | null
  errors: number
  lastError: string | null
  confirmBlocked: number
  stuck: number
}

function confirmBlockedMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false
  return (meta as { confirm_blocked?: unknown }).confirm_blocked === true
}

/** One row per auth user. */
export async function listAiUserStats(): Promise<{
  data?: AiUserStatRow[]
  error?: string
}> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  try {
    const service = createServiceClient()
    const perPage = 100
    let page = 1
    const authUsers: { id: string; email?: string }[] = []
    for (;;) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage })
      if (error) return { error: error.message }
      const batch = data?.users ?? []
      authUsers.push(...batch.map((u) => ({ id: u.id, email: u.email })))
      if (batch.length < perPage) break
      page += 1
      if (page > 50) break
    }

    const snapshots = await Promise.all(
      authUsers.map((u) => readAiUsageSnapshot(u.id))
    )
    if (snapshots.some((s) => s == null)) {
      return { error: AI_USAGE_READ_FAILED_MESSAGE }
    }

    const pageSize = 1000
    const raw: Array<{
      user_id: string
      created_at: string
      feature: string
      status: string
      error_summary: string | null
      meta: unknown
    }> = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await service
        .from('agent_runs')
        .select('user_id, created_at, feature, status, error_summary, meta')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) return { error: error.message }
      const batch = data ?? []
      raw.push(...batch)
      if (batch.length < pageSize) break
      if (from + pageSize >= 20000) {
        return { error: 'Too many agent runs to summarize.' }
      }
    }

    const byUser = new Map<string, UserStatSource[]>()
    for (const row of raw) {
      const list = byUser.get(row.user_id) ?? []
      list.push({
        createdAt: row.created_at,
        feature: row.feature,
        status: row.status,
        errorSummary: row.error_summary,
        eval: isEvalMeta(row.meta),
        confirmBlocked: confirmBlockedMeta(row.meta),
      })
      byUser.set(row.user_id, list)
    }

    const now = new Date()
    const rows: AiUserStatRow[] = authUsers.map((user, i) => {
      const snapshot = snapshots[i]!
      const stats = groupUserUsage(
        byUser.get(user.id) ?? [],
        new Date(snapshot.periodStartedAt),
        now
      )
      const over = allowanceLeft(
        snapshot.allowanceUsd,
        snapshot.window.estimatedUsd
      )
      return {
        userId: user.id,
        caller: callerLabel(user.email, user.id),
        isAdmin: snapshot.isAdmin,
        periodUsd: snapshot.window.estimatedUsd,
        allowanceUsd: snapshot.allowanceUsd,
        overUsd: over.overUsd,
        allTimeUsd: snapshot.allTime.estimatedUsd,
        evalUsd: snapshot.evalAllTime.estimatedUsd,
        calls: stats.calls,
        mostUsed: stats.mostUsed,
        lastCall: stats.lastCall,
        errors: stats.errors,
        lastError: stats.lastError,
        confirmBlocked: stats.confirmBlocked,
        stuck: stats.stuck,
      }
    })

    rows.sort((a, b) => {
      if (!a.lastCall && !b.lastCall) return a.caller.localeCompare(b.caller)
      if (!a.lastCall) return 1
      if (!b.lastCall) return -1
      return b.lastCall.at < a.lastCall.at ? -1 : b.lastCall.at > a.lastCall.at ? 1 : 0
    })

    return { data: rows }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to load AI user stats',
    }
  }
}
