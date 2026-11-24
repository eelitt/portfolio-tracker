/**
 * Overview row pick and the health rollup. The action only loads the rows.
 */

import type { AgentRunMeta, AgentToolRecord } from './types'

/** Prefer the date window. An empty window falls back to the latest rows. */
export function pickOverviewRows<T>(
  windowRows: T[],
  latestRows: T[]
): { rows: T[]; outsideWindow: boolean } {
  if (windowRows.length > 0) {
    return { rows: windowRows, outsideWindow: false }
  }
  return { rows: latestRows, outsideWindow: latestRows.length > 0 }
}

/** One agent_runs row as the overview query returns it. */
export type OverviewSourceRow = {
  created_at: string
  status: string
  duration_ms: number | string | null
  estimated_cost_usd: number | string | null
  total_tokens: number | string | null
  tools: AgentToolRecord[] | null
  meta: AgentRunMeta | null
}

/** Aggregates for the Overview tab. */
export type AgentOverviewStats = {
  windowDays: number
  totalRuns: number
  errorRate: number
  successCount: number
  errorCount: number
  partialCount: number
  avgDurationMs: number | null
  avgEstimatedCostUsd: number | null
  avgTotalTokens: number | null
  toolErrorCounts: Array<{ name: string; errors: number; total: number }>
  confirmAttempts: number
  confirmBlocked: number
  confirmSuccess: number
  /** True when the window was empty and these figures are older rows. */
  outsideWindow: boolean
  oldestAt: string | null
  newestAt: string | null
}

function num(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Counts and averages over the rows pickOverviewRows chose. */
export function summarizeOverview(
  rows: OverviewSourceRow[],
  input: { windowDays: number; outsideWindow: boolean }
): AgentOverviewStats {
  let oldestAt: string | null = null
  let newestAt: string | null = null
  let successCount = 0
  let errorCount = 0
  let partialCount = 0
  let durationSum = 0
  let durationN = 0
  let costSum = 0
  let costN = 0
  let tokenSum = 0
  let tokenN = 0
  let confirmAttempts = 0
  let confirmBlocked = 0
  let confirmSuccess = 0
  const toolStats = new Map<string, { errors: number; total: number }>()

  for (const row of rows) {
    const at = row.created_at
    if (!oldestAt || at < oldestAt) oldestAt = at
    if (!newestAt || at > newestAt) newestAt = at

    if (row.status === 'success') successCount++
    else if (row.status === 'error') errorCount++
    else if (row.status === 'partial') partialCount++

    const duration = num(row.duration_ms)
    if (duration != null) {
      durationSum += duration
      durationN++
    }
    const cost = num(row.estimated_cost_usd)
    if (cost != null) {
      costSum += cost
      costN++
    }
    const tokens = num(row.total_tokens)
    if (tokens != null) {
      tokenSum += tokens
      tokenN++
    }

    const meta = row.meta ?? {}
    if (meta.had_confirm_attempt) confirmAttempts++
    if (meta.confirm_blocked) confirmBlocked++
    if (meta.confirm_success) confirmSuccess++

    for (const tool of row.tools ?? []) {
      const cur = toolStats.get(tool.name) ?? { errors: 0, total: 0 }
      cur.total++
      if (!tool.ok) cur.errors++
      toolStats.set(tool.name, cur)
    }
  }

  const totalRuns = rows.length
  const toolErrorCounts = Array.from(toolStats.entries())
    .map(([name, s]) => ({ name, errors: s.errors, total: s.total }))
    .sort((a, b) => b.errors - a.errors || b.total - a.total)
    .slice(0, 12)

  return {
    windowDays: input.windowDays,
    totalRuns,
    errorRate: totalRuns > 0 ? errorCount / totalRuns : 0,
    successCount,
    errorCount,
    partialCount,
    avgDurationMs: durationN ? durationSum / durationN : null,
    avgEstimatedCostUsd: costN ? costSum / costN : null,
    avgTotalTokens: tokenN ? tokenSum / tokenN : null,
    toolErrorCounts,
    confirmAttempts,
    confirmBlocked,
    confirmSuccess,
    outsideWindow: input.outsideWindow,
    oldestAt,
    newestAt,
  }
}
