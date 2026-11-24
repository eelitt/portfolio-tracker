/**
 * Admin eval tab: fixture list, latest scorecard, and the short Server Action runner.
 * The live suite from the UI uses POST /api/admin/agent-eval.
 */

'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import { listEvalFixtureMeta } from '@/lib/agentEval/loadFixtures'
import { runPortfolioAnalystEvalSuite } from '@/lib/agentEval/runSuite'
import { requireAdmin } from '@/lib/requireAdmin'

/** Fixture ids and descriptions for the Eval tab (no seeds). */
export async function listEvalCases(): Promise<{
  data?: Array<{ id: string; description: string; feature: string }>
  error?: string
}> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }
  return {
    data: [
      ...listEvalFixtureMeta('portfolio_analyst'),
      ...listEvalFixtureMeta('portfolio_orchestrator'),
    ],
  }
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

/** Most recent suite run and its per-case scorecard. */
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
