/**
 * Pure AI-allowance rules. The server gate in allowance.ts is the only caller
 * that reads or writes the database.
 */

export const DEFAULT_AI_ALLOWANCE_USD = 1
export const AI_USAGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_AI_ALLOWANCE_USD = 999_999

export type UsageTotals = {
  promptTokens: number
  completionTokens: number
  estimatedUsd: number
}

export type UsageRow = {
  userId: string
  createdAt: string
  promptTokens: number | null
  completionTokens: number | null
  estimatedCostUsd: number | null
  eval: boolean
}

export function emptyUsage(): UsageTotals {
  return { promptTokens: 0, completionTokens: 0, estimatedUsd: 0 }
}

/** True when the row was written by the admin eval suite. */
export function isEvalMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') return false
  const id = (meta as { eval_case_id?: unknown }).eval_case_id
  return typeof id === 'string' && id.length > 0
}

/**
 * Window start used for the sum. An expired or missing start rolls to `now`.
 * The caller persists that timestamp.
 */
export function effectivePeriodStart(
  periodStartedAt: string | null,
  now: Date
): { start: Date; rolled: boolean } {
  if (!periodStartedAt) return { start: now, rolled: true }
  const start = new Date(periodStartedAt)
  if (Number.isNaN(start.getTime())) return { start: now, rolled: true }
  if (now.getTime() - start.getTime() >= AI_USAGE_WINDOW_MS) {
    return { start: now, rolled: true }
  }
  return { start, rolled: false }
}

export function periodEndsAt(start: Date): Date {
  return new Date(start.getTime() + AI_USAGE_WINDOW_MS)
}

/** Product rows are every call except eval. Eval is summed on its own. */
export function sumUsage(
  rows: UsageRow[],
  userId: string,
  since: Date | null,
  which: 'product' | 'eval'
): UsageTotals {
  const totals = emptyUsage()
  const sinceMs = since ? since.getTime() : null
  for (const row of rows) {
    if (row.userId !== userId) continue
    if (which === 'eval' ? !row.eval : row.eval) continue
    if (sinceMs != null) {
      const at = new Date(row.createdAt).getTime()
      if (Number.isNaN(at) || at < sinceMs) continue
    }
    totals.promptTokens += row.promptTokens ?? 0
    totals.completionTokens += row.completionTokens ?? 0
    totals.estimatedUsd += row.estimatedCostUsd ?? 0
  }
  return totals
}

export function decideAiAllowance(input: {
  readFailed: boolean
  isAdmin: boolean
  allowanceUsd: number
  spentUsd: number
}): { allowed: boolean; reason: 'ok' | 'admin' | 'over' | 'read_failed' } {
  if (input.readFailed) return { allowed: false, reason: 'read_failed' }
  if (input.isAdmin) return { allowed: true, reason: 'admin' }
  if (input.spentUsd >= input.allowanceUsd) {
    return { allowed: false, reason: 'over' }
  }
  return { allowed: true, reason: 'ok' }
}

function round6(amount: number): number {
  return Number(amount.toFixed(6))
}

/** Left floors at 0. Over is the amount past the allowance. */
export function allowanceLeft(
  allowanceUsd: number,
  spentUsd: number
): { leftUsd: number; overUsd: number } {
  const overUsd = round6(Math.max(0, spentUsd - allowanceUsd))
  const leftUsd = round6(Math.max(0, allowanceUsd - spentUsd))
  return { leftUsd, overUsd }
}

/** Null when the number is not a finite allowance in range. */
export function parseAllowanceUsd(value: number): number | null {
  if (!Number.isFinite(value) || value < 0 || value > MAX_AI_ALLOWANCE_USD) {
    return null
  }
  return Number(value.toFixed(6))
}

export function allowanceRefusalMessage(endsAt: Date): string {
  return `AI allowance used for this period. It resets at ${endsAt.toISOString()}.`
}

export const AI_USAGE_READ_FAILED_MESSAGE =
  'AI usage could not be checked. Try again later.'

export function formatEstimatedUsd(amount: number): string {
  return `$${amount.toFixed(4)}`
}
