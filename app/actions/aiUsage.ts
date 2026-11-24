'use server'

import { readAiUsageSnapshot } from '@/lib/aiUsage/allowance'
import type { UsageTotals } from '@/lib/aiUsage/decide'
import { getCurrentUser } from '@/lib/user'

export type AiUsageView = {
  isAdmin: boolean
  allowanceUsd: number
  periodEndsAt: string
  window: UsageTotals
  allTime: UsageTotals
  evalWindow: UsageTotals
  evalAllTime: UsageTotals
}

/** Aggregate for the signed-in user. No question text and no run rows. */
export async function getMyAiUsage(): Promise<{
  data?: AiUsageView
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const snapshot = await readAiUsageSnapshot(user.id)
  if (!snapshot) return { error: 'AI usage could not be checked.' }

  return {
    data: {
      isAdmin: snapshot.isAdmin,
      allowanceUsd: snapshot.allowanceUsd,
      periodEndsAt: snapshot.periodEndsAt,
      window: snapshot.window,
      allTime: snapshot.allTime,
      evalWindow: snapshot.isAdmin ? snapshot.evalWindow : { promptTokens: 0, completionTokens: 0, estimatedUsd: 0 },
      evalAllTime: snapshot.isAdmin ? snapshot.evalAllTime : { promptTokens: 0, completionTokens: 0, estimatedUsd: 0 },
    },
  }
}
