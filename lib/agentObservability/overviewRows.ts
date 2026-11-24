/**
 * Overview window and the health rollup. The action only loads the rows.
 */

import type { AgentRunMeta, AgentToolRecord } from './types'

/** Overview presets. Last month is the rolling 30-day window. */
export type OverviewPreset = 'week' | 'month' | 'all'

/** Rows read per page. PostgREST stops at 1,000. */
export const OVERVIEW_PAGE_SIZE = 1000

/** Stop after this many rows and say the figures are the newest ones. */
export const OVERVIEW_ROW_CAP = 5000

/** Rolling window for a preset. All time has no start. An unknown preset is 30 days. */
export function overviewWindowDays(preset: string): 7 | 30 | null {
  if (preset === 'week') return 7
  if (preset === 'all') return null
  return 30
}

/** One agent_runs row as the overview query returns it. */
export type OverviewSourceRow = {
  id?: string
  parent_run_id?: string | null
  feature?: string
  created_at: string
  status: string
  duration_ms: number | string | null
  estimated_cost_usd: number | string | null
  total_tokens: number | string | null
  tools: AgentToolRecord[] | null
  meta: AgentRunMeta | null
}

/** One stored tool call shown under an Overview tool tally. */
export type OverviewToolSample = {
  runId: string
  parentRunId: string | null
  feature: string
  createdAt: string
  ok: boolean
  latencyMs: number | null
  error: string | null
  args: Record<string, unknown>
}

/** Errors and newest calls for one tool name in the Overview window. */
export type OverviewToolCount = {
  name: string
  errors: number
  total: number
  errorGroups: Array<{ error: string; count: number }>
  recent: OverviewToolSample[]
}

export type OverviewToolCatalogEntry = {
  id: string
  owner: 'orchestrator' | 'portfolio_analyst'
  label: string
  sideEffect: string
  requiresConfirmation: boolean
}

/** One Overview tool row: a registry tool, or a recorded name that is not registered. */
export type OverviewToolRow = OverviewToolCount & {
  owner: OverviewToolCatalogEntry['owner'] | null
  label: string | null
  sideEffect: string | null
  requiresConfirmation: boolean
  inRegistry: boolean
  /** True when a fixture expects this tool to be called. Unused for unknown names. */
  covered: boolean
}

/** Fixture fields that count as expecting a tool. `forbiddenTools` is ignored. */
export type OverviewToolExpect = {
  toolsAnyOf?: string[][]
  argsEquals?: Array<{ tool: string }>
  argsNot?: Array<{ tool: string }>
  failureModeOnTool?: Array<{ tool: string }>
  numericFromTools?: Array<{ tool?: string }>
  mustNotSucceedConfirm?: boolean
  mustNotCallConfirm?: boolean
}

const TOOL_OWNER_ORDER: Array<OverviewToolCatalogEntry['owner']> = [
  'orchestrator',
  'portfolio_analyst',
]

const TOOL_SAMPLE_CAP = 5
const TOOL_ERROR_GROUP_CAP = 5

/** Aggregates for the Overview tab. */
export type AgentOverviewStats = {
  /** 7, 30, or null for all time. */
  windowDays: 7 | 30 | null
  /** True when the read stopped at OVERVIEW_ROW_CAP and older rows remain. */
  capped: boolean
  totalRuns: number
  errorRate: number
  successCount: number
  errorCount: number
  partialCount: number
  runningCount: number
  avgDurationMs: number | null
  avgEstimatedCostUsd: number | null
  totalEstimatedCostUsd: number | null
  avgTotalTokens: number | null
  toolErrorCounts: OverviewToolCount[]
  /** Registry order, then recorded names that are not registered. */
  tools: OverviewToolRow[]
  confirmAttempts: number
  confirmBlocked: number
  confirmSuccess: number
}

function num(value: number | string | null | undefined): number | null {
  if (value == null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Counts and averages over the rows the overview query returned. */
export function summarizeOverview(
  rows: OverviewSourceRow[],
  input: { windowDays: 7 | 30 | null; capped: boolean }
): AgentOverviewStats {
  let successCount = 0
  let errorCount = 0
  let partialCount = 0
  let runningCount = 0
  let durationSum = 0
  let durationN = 0
  let costSum = 0
  let costN = 0
  let tokenSum = 0
  let tokenN = 0
  let confirmAttempts = 0
  let confirmBlocked = 0
  let confirmSuccess = 0
  const toolStats = new Map<
    string,
    {
      errors: number
      total: number
      errorCounts: Map<string, number>
      recent: OverviewToolSample[]
    }
  >()

  for (const row of rows) {
    if (row.status === 'success') successCount++
    else if (row.status === 'error') errorCount++
    else if (row.status === 'partial') partialCount++
    else if (row.status === 'running') runningCount++

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
      const cur = toolStats.get(tool.name) ?? {
        errors: 0,
        total: 0,
        errorCounts: new Map<string, number>(),
        recent: [],
      }
      cur.total++
      if (!tool.ok) {
        cur.errors++
        const message = tool.error?.trim()
        if (message) {
          cur.errorCounts.set(message, (cur.errorCounts.get(message) ?? 0) + 1)
        }
      }
      if (cur.recent.length < TOOL_SAMPLE_CAP && row.id) {
        cur.recent.push({
          runId: row.id,
          parentRunId: row.parent_run_id ?? null,
          feature: row.feature ?? '',
          createdAt: row.created_at,
          ok: tool.ok,
          latencyMs: tool.latency_ms ?? null,
          error: tool.error ?? null,
          args: tool.args ?? {},
        })
      }
      toolStats.set(tool.name, cur)
    }
  }

  const totalRuns = rows.length
  const toolErrorCounts = Array.from(toolStats.entries())
    .map(([name, s]) => ({
      name,
      errors: s.errors,
      total: s.total,
      errorGroups: Array.from(s.errorCounts.entries())
        .map(([error, count]) => ({ error, count }))
        .sort((a, b) => b.count - a.count || a.error.localeCompare(b.error))
        .slice(0, TOOL_ERROR_GROUP_CAP),
      recent: s.recent,
    }))
    .sort((a, b) => b.errors - a.errors || b.total - a.total)

  return {
    windowDays: input.windowDays,
    capped: input.capped,
    totalRuns,
    errorRate: totalRuns > 0 ? errorCount / totalRuns : 0,
    successCount,
    errorCount,
    partialCount,
    runningCount,
    avgDurationMs: durationN ? durationSum / durationN : null,
    avgEstimatedCostUsd: costN ? costSum / costN : null,
    totalEstimatedCostUsd: costN ? costSum : null,
    avgTotalTokens: tokenN ? tokenSum / tokenN : null,
    toolErrorCounts,
    tools: [],
    confirmAttempts,
    confirmBlocked,
    confirmSuccess,
  }
}

/** Tool ids a fixture expects to be called. A forbid-only mention does not count. */
export function coveredToolIds(expects: OverviewToolExpect[]): Set<string> {
  const ids = new Set<string>()
  for (const expect of expects) {
    for (const group of expect.toolsAnyOf ?? []) {
      for (const name of group) ids.add(name)
    }
    for (const item of expect.argsEquals ?? []) ids.add(item.tool)
    for (const item of expect.argsNot ?? []) ids.add(item.tool)
    for (const item of expect.failureModeOnTool ?? []) ids.add(item.tool)
    for (const item of expect.numericFromTools ?? []) {
      if (item.tool) ids.add(item.tool)
    }
    if (expect.mustNotSucceedConfirm || expect.mustNotCallConfirm) {
      ids.add('confirm_transaction')
    }
  }
  return ids
}

/**
 * Registry order under orchestrator then analyst, with 0/0 for tools that
 * did not appear. Recorded names missing from the catalog follow.
 */
export function attachToolCatalog(
  counts: OverviewToolCount[],
  catalog: OverviewToolCatalogEntry[],
  coveredIds: Iterable<string>
): OverviewToolRow[] {
  const covered = new Set(coveredIds)
  const byName = new Map(counts.map((count) => [count.name, count]))
  const seen = new Set<string>()
  const rows: OverviewToolRow[] = []

  for (const owner of TOOL_OWNER_ORDER) {
    for (const entry of catalog) {
      if (entry.owner !== owner || seen.has(entry.id)) continue
      seen.add(entry.id)
      const count = byName.get(entry.id)
      rows.push({
        name: entry.id,
        errors: count?.errors ?? 0,
        total: count?.total ?? 0,
        errorGroups: count?.errorGroups ?? [],
        recent: count?.recent ?? [],
        owner: entry.owner,
        label: entry.label,
        sideEffect: entry.sideEffect,
        requiresConfirmation: entry.requiresConfirmation,
        inRegistry: true,
        covered: covered.has(entry.id),
      })
    }
  }

  const unknown = counts
    .filter((count) => !seen.has(count.name))
    .sort((a, b) => b.errors - a.errors || b.total - a.total || a.name.localeCompare(b.name))
  for (const count of unknown) {
    rows.push({
      ...count,
      owner: null,
      label: null,
      sideEffect: null,
      requiresConfirmation: false,
      inRegistry: false,
      covered: false,
    })
  }

  return rows
}
