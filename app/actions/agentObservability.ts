/**
 * Admin Server Actions for agent run logs, overview aggregates, and eval metadata.
 * All reads/writes use the service-role client after requireAdmin().
 * Long-running live suite prefers POST /api/admin/agent-eval (higher maxDuration).
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/user'
import type { AgentRunRow, AgentToolRecord, AgentRunMeta } from '@/lib/agentObservability'
import { listEvalFixtureMeta } from '@/lib/agentEval/loadFixtures'
import { runPortfolioAnalystEvalSuite } from '@/lib/agentEval/runSuite'

async function requireAdmin(): Promise<
  { user: { id: string }; error?: undefined } | { user?: undefined; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.admin !== true) {
    return { error: 'Admin access required' }
  }

  return { user: { id: user.id } }
}

/** Map a raw Supabase row to the typed admin UI shape. */
function mapRunRow(row: Record<string, unknown>): AgentRunRow {
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
    user_id: row.user_id as string,
    feature: row.feature as string,
    schema_version: Number(row.schema_version ?? 1),
    status: row.status as AgentRunRow['status'],
    model: (row.model as string | null) ?? null,
    duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
    step_count: Number(row.step_count ?? 0),
    prompt_tokens: row.prompt_tokens != null ? Number(row.prompt_tokens) : null,
    completion_tokens:
      row.completion_tokens != null ? Number(row.completion_tokens) : null,
    total_tokens: row.total_tokens != null ? Number(row.total_tokens) : null,
    estimated_cost_usd:
      row.estimated_cost_usd != null ? Number(row.estimated_cost_usd) : null,
    tools: (row.tools as AgentToolRecord[]) || [],
    meta: (row.meta as AgentRunMeta) || {},
    error_summary: (row.error_summary as string | null) ?? null,
  }
}

/** Recent agent_runs for the Runs tab (newest first). */
export async function listAgentRuns(opts?: {
  limit?: number
  feature?: string
}): Promise<{ data?: AgentRunRow[]; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  try {
    const service = createServiceClient()
    const limit = Math.min(opts?.limit ?? 50, 100)
    let q = service
      .from('agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (opts?.feature) {
      q = q.eq('feature', opts.feature)
    }

    const { data, error } = await q
    if (error) return { error: error.message }
    return { data: (data || []).map((r) => mapRunRow(r as Record<string, unknown>)) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to list agent runs' }
  }
}

/** Single run detail (tools timeline). */
export async function getAgentRun(
  id: string
): Promise<{ data?: AgentRunRow; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }
  if (!id) return { error: 'Missing run id' }

  try {
    const service = createServiceClient()
    const { data, error } = await service
      .from('agent_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { error: 'Run not found' }
    return { data: mapRunRow(data as Record<string, unknown>) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load agent run' }
  }
}

/** Aggregates for the Overview tab (computed in-process over recent rows). */
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
}

export async function getAgentOverview(
  windowDays = 30
): Promise<{ data?: AgentOverviewStats; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  const days = Math.min(Math.max(windowDays, 1), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const service = createServiceClient()
    const { data, error } = await service
      .from('agent_runs')
      .select(
        'status, duration_ms, estimated_cost_usd, total_tokens, tools, meta'
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return { error: error.message }

    const rows = data || []
    const totalRuns = rows.length
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
      const status = row.status as string
      if (status === 'success') successCount++
      else if (status === 'error') errorCount++
      else if (status === 'partial') partialCount++

      if (row.duration_ms != null) {
        durationSum += Number(row.duration_ms)
        durationN++
      }
      if (row.estimated_cost_usd != null) {
        costSum += Number(row.estimated_cost_usd)
        costN++
      }
      if (row.total_tokens != null) {
        tokenSum += Number(row.total_tokens)
        tokenN++
      }

      const meta = (row.meta || {}) as AgentRunMeta
      if (meta.had_confirm_attempt) confirmAttempts++
      if (meta.confirm_blocked) confirmBlocked++
      if (meta.confirm_success) confirmSuccess++

      const tools = (row.tools || []) as AgentToolRecord[]
      for (const t of tools) {
        const cur = toolStats.get(t.name) || { errors: 0, total: 0 }
        cur.total++
        if (!t.ok) cur.errors++
        toolStats.set(t.name, cur)
      }
    }

    const toolErrorCounts = Array.from(toolStats.entries())
      .map(([name, s]) => ({ name, errors: s.errors, total: s.total }))
      .sort((a, b) => b.errors - a.errors || b.total - a.total)
      .slice(0, 12)

    return {
      data: {
        windowDays: days,
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
      },
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to load overview',
    }
  }
}

/** Fixture ids/descriptions for the Eval tab (no seeds). */
export async function listEvalCases(): Promise<{
  data?: Array<{ id: string; description: string; feature: string }>
  error?: string
}> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }
  return { data: listEvalFixtureMeta('portfolio_analyst') }
}

export type EvalRunSummary = {
  id: string
  created_at: string
  status: string
  total_cases: number
  passed: number
  failed: number
  duration_ms: number | null
  mode: string
  feature: string
}

/** Most recent suite run + per-case scorecard. */
export async function getLatestEvalRun(): Promise<{
  data?: {
    run: EvalRunSummary
    results: Array<{
      case_id: string
      passed: boolean
      scores: unknown
      agent_run_id: string | null
      error_summary: string | null
    }>
  } | null
  error?: string
}> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  try {
    const service = createServiceClient()
    const { data: run, error } = await service
      .from('agent_eval_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!run) return { data: null }

    const { data: results, error: rErr } = await service
      .from('agent_eval_results')
      .select('case_id, passed, scores, agent_run_id, error_summary')
      .eq('eval_run_id', run.id)
      .order('created_at', { ascending: true })

    if (rErr) return { error: rErr.message }

    return {
      data: {
        run: {
          id: run.id,
          created_at: run.created_at,
          status: run.status,
          total_cases: run.total_cases,
          passed: run.passed,
          failed: run.failed,
          duration_ms: run.duration_ms,
          mode: run.mode,
          feature: run.feature,
        },
        results: (results || []).map((r) => ({
          case_id: r.case_id,
          passed: r.passed,
          scores: r.scores,
          agent_run_id: r.agent_run_id,
          error_summary: r.error_summary,
        })),
      },
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to load latest eval run',
    }
  }
}

/**
 * Live eval via Server Action (may hit platform timeouts).
 * Prefer POST /api/admin/agent-eval from the admin UI.
 */
export async function runAgentEvalSuite(): Promise<{
  data?: {
    evalRunId: string
    passed: number
    failed: number
    total: number
    durationMs: number
  }
  error?: string
}> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  const result = await runPortfolioAnalystEvalSuite(gate.user!.id)
  if (result.error) return { error: result.error }
  if (!result.data) return { error: 'Eval suite produced no data' }

  return {
    data: {
      evalRunId: result.data.evalRunId,
      passed: result.data.passed,
      failed: result.data.failed,
      total: result.data.total,
      durationMs: result.data.durationMs,
    },
  }
}
