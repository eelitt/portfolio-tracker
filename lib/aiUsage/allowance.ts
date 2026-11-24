/**
 * Server meter for one user's AI allowance.
 * Menu, admin table, and the model gate all call readAiUsageSnapshot.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase/admin'
import { getCurrentUser, isCurrentUserAdmin } from '@/lib/user'
import {
  AI_ENTRY_BUSY_MESSAGE,
  AI_ENTRY_STALE_MS,
  AI_USAGE_READ_FAILED_MESSAGE,
  DEFAULT_AI_ALLOWANCE_USD,
  allowanceRefusalMessage,
  decideAiAllowance,
  effectivePeriodStart,
  periodEndsAt,
  usageTotalsFromRpc,
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

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
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

    const { data: totals, error: totalsError } = await service.rpc(
      'ai_usage_totals',
      { p_user_id: userId, p_since: periodStartedAt }
    )
    const summed = usageTotalsFromRpc(totals)
    if (totalsError || !summed) {
      console.error('AI usage read failed:', totalsError?.code ?? 'bad totals')
      return null
    }

    const start = new Date(periodStartedAt)
    const allowanceUsd =
      asNumber(profile.ai_allowance_usd as number | string | null) ??
      DEFAULT_AI_ALLOWANCE_USD

    return {
      isAdmin: profile.admin === true,
      allowanceUsd,
      periodStartedAt,
      periodEndsAt: periodEndsAt(start).toISOString(),
      window: summed.window,
      allTime: summed.allTime,
      evalWindow: summed.evalWindow,
      evalAllTime: summed.evalAllTime,
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

export type AiEntrySlot =
  | { ok: true; token: string | null }
  | { ok: false; message: string }

/**
 * One in-flight model entry for a non-admin.
 * Admins skip the slot. A slot older than four minutes is taken again.
 */
export async function tryBeginAiEntry(userId: string): Promise<AiEntrySlot> {
  const session = await getCurrentUser()
  if (!session || session.id !== userId) {
    return { ok: false, message: 'Not authenticated' }
  }
  if (await isCurrentUserAdmin()) {
    return { ok: true, token: null }
  }

  try {
    const service = createServiceClient()
    const token = new Date().toISOString()
    const staleBefore = new Date(Date.now() - AI_ENTRY_STALE_MS).toISOString()
    const { data, error } = await service
      .from('profiles')
      .update({
        ai_entry_started_at: token,
        updated_at: token,
      })
      .eq('id', userId)
      .or(
        `ai_entry_started_at.is.null,ai_entry_started_at.lt."${staleBefore}"`
      )
      .select('ai_entry_started_at')

    if (error) {
      console.error('AI entry lock failed:', error.code ?? 'update')
      return { ok: false, message: AI_USAGE_READ_FAILED_MESSAGE }
    }
    if (!data || data.length === 0) {
      return { ok: false, message: AI_ENTRY_BUSY_MESSAGE }
    }
    return { ok: true, token }
  } catch (e) {
    console.error(
      'AI entry lock error:',
      e instanceof Error ? e.name : 'Error'
    )
    return { ok: false, message: AI_USAGE_READ_FAILED_MESSAGE }
  }
}

/** Clear the slot only when it is still the one this entry took. */
export async function endAiEntry(
  userId: string,
  token: string | null
): Promise<void> {
  if (!token) return
  try {
    const service = createServiceClient()
    const { error } = await service
      .from('profiles')
      .update({ ai_entry_started_at: null })
      .eq('id', userId)
      .eq('ai_entry_started_at', token)
    if (error) {
      console.error('AI entry release failed:', error.code ?? 'update')
    }
  } catch (e) {
    console.error(
      'AI entry release error:',
      e instanceof Error ? e.name : 'Error'
    )
  }
}
