/**
 * Pending NL transaction draft for Portfolio Analyst (prepare → confirm).
 * Stored in user_ai_insights; no migration. TTL so stale drafts expire.
 */

import {
  getLatestAIInsight,
  saveAIInsight,
} from '@/app/actions/ai/storage'
import type { ValidatedTxDraft } from '@/lib/portfolioAnalyst'

const FEATURE_TYPE = 'portfolio_analyst_pending_tx'

/** Drafts older than this cannot be confirmed. */
export const PENDING_DRAFT_TTL_MS = 30 * 60 * 1000

export type PendingTxDraft = {
  sourceText: string
  draft: ValidatedTxDraft
  summary: string
  warnings: string[]
  preparedAt: string
}

function parsePending(result: Record<string, unknown> | undefined): PendingTxDraft | null {
  if (!result || result.empty === true) return null
  const sourceText = result.sourceText
  const summary = result.summary
  const preparedAt = result.preparedAt
  const draft = result.draft
  if (
    typeof sourceText !== 'string' ||
    typeof summary !== 'string' ||
    typeof preparedAt !== 'string' ||
    !draft ||
    typeof draft !== 'object'
  ) {
    return null
  }
  const d = draft as Record<string, unknown>
  if (
    typeof d.symbol !== 'string' ||
    typeof d.asset_type !== 'string' ||
    typeof d.action !== 'string' ||
    typeof d.quantity !== 'number' ||
    typeof d.unit_price !== 'number' ||
    typeof d.executed_at !== 'string' ||
    typeof d.currency !== 'string'
  ) {
    return null
  }
  return {
    sourceText,
    summary,
    preparedAt,
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
    draft: {
      symbol: d.symbol,
      asset_type: d.asset_type as ValidatedTxDraft['asset_type'],
      action: d.action as ValidatedTxDraft['action'],
      quantity: d.quantity,
      unit_price: d.unit_price,
      executed_at: d.executed_at,
      notes: typeof d.notes === 'string' ? d.notes : undefined,
      currency: d.currency as ValidatedTxDraft['currency'],
      currencySource: 'text',
    },
  }
}

export async function savePendingTxDraft(
  userId: string,
  pending: PendingTxDraft
): Promise<void> {
  await saveAIInsight(userId, FEATURE_TYPE, {
    ...pending,
    empty: false,
  })
}

export async function getPendingTxDraft(
  userId: string
): Promise<PendingTxDraft | null> {
  const row = await getLatestAIInsight(userId, FEATURE_TYPE)
  const pending = parsePending(row?.result)
  if (!pending) return null

  const age = Date.now() - new Date(pending.preparedAt).getTime()
  if (!Number.isFinite(age) || age > PENDING_DRAFT_TTL_MS) {
    await clearPendingTxDraft(userId)
    return null
  }
  return pending
}

export async function clearPendingTxDraft(userId: string): Promise<void> {
  await saveAIInsight(userId, FEATURE_TYPE, {
    empty: true,
    clearedAt: new Date().toISOString(),
  })
}
