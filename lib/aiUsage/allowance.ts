/**
 * Server meter for one user's AI allowance.
 * Menu, admin table, and the model gate all call readAiUsageSnapshot.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/user'
import {
  AI_USAGE_READ_FAILED_MESSAGE,
  DEFAULT_AI_ALLOWANCE_USD,
  allowanceRefusalMessage,
  decideAiAllowance,
  effectivePeriodStart,
  isEvalMeta,
  periodEndsAt,
  sumUsage,
  type UsageRow,
  type UsageTotals,
} from './decide'

export type AiUsageSnapshot = {
  isAdmin: boolean
  allowanceUsd: number
  periodStartedAt: string
  periodEndsAt: string
  window: UsageTotals
  allTime: UsageTotals
  evalWindow: UsageTotals
  evalAllTime: UsageTotals
}

export type AllowanceGate =
  | { allowed: true }
  | { allowed: false; message: string }

type RunRow = {
  user_id: string
  created_at: string
  prompt_tokens: number | null
  completion_tokens: number | null
  estimated_cost_usd: number | string | null
  meta: unknown
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function toUsageRow(row: RunRow): UsageRow {
  return {
    userId: row.user_id,
    createdAt: row.created_at,
    promptTokens: asNumber(row.prompt_tokens),
    completionTokens: asNumber(row.completion_tokens),
    estimatedCostUsd: asNumber(row.estimated_cost_usd),
    eval: isEvalMeta(row.meta),
  }
}

/**
 * Roll the window when it is due, then sum this user's rows.
 * Returns null when the profile or the usage read fails.
 */
export async function readAiUsageSnapshot(
  userId: string
): Promise<AiUsageSnapshot | null> {
  try {
    const service = createServiceClient()
    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('admin, ai_allowance_usd, period_started_at')
      .eq('id', userId)
      .maybeSingle()

    if (profileError || !profile) {
      console.error(
        'AI usage profile read failed:',
        profileError?.message ?? 'no profile'
      )
      return null
    }

    const now = new Date()
    const rolled = effectivePeriodStart(
      typeof profile.period_started_at === 'string'
        ? profile.period_started_at
        : null,
      now
    )
    let periodStartedAt = rolled.start.toISOString()

    if (rolled.rolled) {
      const { error: rollError } = await service
        .from('profiles')
        .update({
          period_started_at: periodStartedAt,
          updated_at: now.toISOString(),
        })
        .eq('id', userId)
      if (rollError) {
        console.error('AI usage window roll failed:', rollError.message)
      }
    }

    const { data: runs, error: runsError } = await service
      .from('agent_runs')
      .select(
        'user_id, created_at, prompt_tokens, completion_tokens, estimated_cost_usd, meta'
      )
      .eq('user_id', userId)

    if (runsError || !runs) {
      console.error('AI usage read failed:', runsError?.message ?? 'no rows')
      return null
    }

    const rows = (runs as RunRow[]).map(toUsageRow)
    const start = new Date(periodStartedAt)
    const allowanceUsd =
      asNumber(profile.ai_allowance_usd as number | string | null) ??
      DEFAULT_AI_ALLOWANCE_USD

    return {
      isAdmin: profile.admin === true,
      allowanceUsd,
      periodStartedAt,
      periodEndsAt: periodEndsAt(start).toISOString(),
      window: sumUsage(rows, userId, start, 'product'),
      allTime: sumUsage(rows, userId, null, 'product'),
      evalWindow: sumUsage(rows, userId, start, 'eval'),
      evalAllTime: sumUsage(rows, userId, null, 'eval'),
    }
  } catch (e) {
    console.error(
      'AI usage snapshot error:',
      e instanceof Error ? e.message : 'unknown'
    )
    return null
  }
}

/** Refuse the model call for this session user when the stored sum is at the cap. */
export async function checkAiAllowance(userId: string): Promise<AllowanceGate> {
  const session = await getCurrentUser()
  if (!session || session.id !== userId) {
    return { allowed: false, message: 'Not authenticated' }
  }

  const snapshot = await readAiUsageSnapshot(userId)
  if (!snapshot) {
    return { allowed: false, message: AI_USAGE_READ_FAILED_MESSAGE }
  }

  const decision = decideAiAllowance({
    readFailed: false,
    isAdmin: snapshot.isAdmin,
    allowanceUsd: snapshot.allowanceUsd,
    spentUsd: snapshot.window.estimatedUsd,
  })

  if (!decision.allowed) {
    if (decision.reason === 'over') {
      return {
        allowed: false,
        message: allowanceRefusalMessage(new Date(snapshot.periodEndsAt)),
      }
    }
    return { allowed: false, message: AI_USAGE_READ_FAILED_MESSAGE }
  }

  return { allowed: true }
}
