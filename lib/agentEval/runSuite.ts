/**
 * Live LLM eval suites (server-only).
 *
 * Analyst: inject seed portfolio → generateText + tools (evalMode) → scoreCase.
 * Orchestrator: same model call, invoke_* tools stubbed, score the route only.
 * Caller must already be admin (API route / server action gate).
 */

import 'server-only'

import { generateText } from 'ai'
import { xai } from '@ai-sdk/xai'
import { PORTFOLIO_ANALYST_SYSTEM_PROMPT } from '@/app/actions/ai/portfolio-analyst/prompt'
import { createPortfolioAnalystTools } from '@/app/actions/ai/portfolio-analyst/tools'
import { ORCHESTRATOR_SYSTEM_PROMPT } from '@/app/actions/ai/orchestrator/prompt'
import { createOrchestratorTools } from '@/app/actions/ai/orchestrator/tools'
import {
  finishAgentRun,
  startAgentRun,
} from '@/lib/agentObservability/recordRun'
import {
  scoreCase,
  toolRecordsFromStepResults,
  type AgentToolRecord,
  type EvalCaseFixture,
  type ScoreResult,
} from '@/lib/agentObservability'
import { createServiceClient } from '@/lib/supabase/admin'
import { buildEvalPortfolioData } from './buildEvalPortfolio'
import { loadEvalFixtures } from './loadFixtures'
import type { EvalSuiteProgress } from './progress'

const MODEL_ID = 'grok-4.3'
const EVAL_RUNNING_STALE_MS = 6 * 60 * 1000
const EVAL_BUSY_MESSAGE = 'An eval suite is already running.'
const EVAL_FAILED_MESSAGE = 'Eval suite failed.'
const ANALYST_FEATURE = 'portfolio_analyst'
const ORCHESTRATOR_FEATURE = 'portfolio_orchestrator'

export type EvalCaseOutcome = {
  caseId: string
  description: string
  passed: boolean
  scores: ScoreResult
  agentRunId: string | null
  errorSummary?: string
  tools: AgentToolRecord[]
}

export type EvalSuiteOutcome = {
  evalRunId: string
  passed: number
  failed: number
  total: number
  durationMs: number
  results: EvalCaseOutcome[]
}

type ModelStep = {
  toolResults?: Array<{ toolName: string; args?: unknown; result?: unknown }>
}

function recordsFromStep(step: ModelStep): AgentToolRecord[] {
  return toolRecordsFromStepResults(
    (step.toolResults || []).map((tr) => ({
      toolName: tr.toolName,
      args: tr.args,
      result: tr.result,
    }))
  )
}

/** One fixture: model call + score + linked agent_run. */
async function runModelCase(
  userId: string,
  fixture: EvalCaseFixture,
  feature: string,
  callModel: (
    runId: string | null,
    onStepFinish: (step: ModelStep) => void
  ) => Promise<{
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    steps?: ModelStep[]
  }>
): Promise<EvalCaseOutcome> {
  const startedAt = Date.now()
  const collected: AgentToolRecord[] = []

  const runId = await startAgentRun({
    userId,
    feature,
    model: MODEL_ID,
    meta: { eval_case_id: fixture.id },
  })

  try {
    const result = await callModel(runId, (step) => {
      collected.push(...recordsFromStep(step))
    })

    // Fallback if step callback did not fire (SDK edge cases)
    if (collected.length === 0 && result.steps) {
      for (const step of result.steps) {
        collected.push(...recordsFromStep(step))
      }
    }

    const scores = scoreCase(fixture.expect, collected)

    if (runId) {
      await finishAgentRun({
        runId,
        status: 'success',
        tools: collected,
        usage: result.usage
          ? {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
            }
          : null,
        model: MODEL_ID,
        durationMs: Date.now() - startedAt,
        stepCount: result.steps?.length ?? collected.length,
        meta: { eval_case_id: fixture.id },
      })
    }

    return {
      caseId: fixture.id,
      description: fixture.description,
      passed: scores.passed,
      scores,
      agentRunId: runId,
      tools: collected,
    }
  } catch (e) {
    console.error('eval case failed:', e instanceof Error ? e.name : 'Error')
    if (runId) {
      await finishAgentRun({
        runId,
        status: 'error',
        tools: collected,
        model: MODEL_ID,
        durationMs: Date.now() - startedAt,
        errorSummary: 'Model call failed.',
        meta: { eval_case_id: fixture.id },
      })
    }
    const scores = scoreCase(fixture.expect, collected)
    return {
      caseId: fixture.id,
      description: fixture.description,
      passed: false,
      scores,
      agentRunId: runId,
      errorSummary: 'Model call failed.',
      tools: collected,
    }
  }
}

function runAnalystCase(userId: string, fixture: EvalCaseFixture) {
  const evalPortfolio = buildEvalPortfolioData(fixture.seed)
  return runModelCase(userId, fixture, ANALYST_FEATURE, (_runId, onStepFinish) =>
    generateText({
      model: xai(MODEL_ID),
      system: PORTFOLIO_ANALYST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: fixture.prompt }],
      tools: createPortfolioAnalystTools(userId, {
        lastUserText: fixture.prompt,
        evalPortfolio,
        evalMode: true, // no pending drafts / no DB writes from confirm
        dryRun: fixture.mode === 'dryRun',
      }),
      maxSteps: 5,
      temperature: 0.1,
      onStepFinish,
    })
  )
}

function runOrchestratorCase(userId: string, fixture: EvalCaseFixture) {
  return runModelCase(userId, fixture, ORCHESTRATOR_FEATURE, (runId, onStepFinish) =>
    generateText({
      model: xai(MODEL_ID),
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: fixture.prompt }],
      tools: createOrchestratorTools({
        userId,
        parentRunId: runId,
        lastUserText: fixture.prompt,
        evalMode: true,
      }),
      maxSteps: 4,
      temperature: 0.1,
      onStepFinish,
    })
  )
}

/**
 * Execute one feature's fixtures sequentially.
 * Writes agent_eval_runs / agent_eval_results; gaps between cases ease rate limits.
 */
async function runEvalSuite(
  adminUserId: string,
  feature: string,
  runCase: (userId: string, fixture: EvalCaseFixture) => Promise<EvalCaseOutcome>,
  onProgress?: (event: EvalSuiteProgress) => void
): Promise<{ data?: EvalSuiteOutcome; error?: string }> {
  if (!process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured (XAI_API_KEY).' }
  }

  const fixtures = loadEvalFixtures(feature)
  if (fixtures.length === 0) {
    return { error: 'No eval fixtures found.' }
  }

  const service = createServiceClient()
  const suiteStarted = Date.now()
  const staleBefore = new Date(Date.now() - EVAL_RUNNING_STALE_MS).toISOString()
  await service
    .from('agent_eval_runs')
    .update({ status: 'failed', summary: { stale: true } })
    .eq('status', 'running')
    .lt('created_at', staleBefore)

  const { data: evalRun, error: insertErr } = await service
    .from('agent_eval_runs')
    .insert({
      started_by: adminUserId,
      feature,
      mode: 'live_llm',
      status: 'running',
      total_cases: fixtures.length,
    })
    .select('id')
    .single()

  if (insertErr || !evalRun?.id) {
    const busy =
      insertErr?.code === '23505' ||
      (insertErr?.message ?? '').includes('agent_eval_runs_one_running')
    return {
      error: busy
        ? EVAL_BUSY_MESSAGE
        : 'Failed to create eval run row (migration applied?)',
    }
  }

  const evalRunId = evalRun.id as string
  const results: EvalCaseOutcome[] = []
  onProgress?.({ type: 'start', total: fixtures.length })

  try {
    for (const fixture of fixtures) {
      const outcome = await runCase(adminUserId, fixture)
      results.push(outcome)

      await service.from('agent_eval_results').insert({
        eval_run_id: evalRunId,
        case_id: outcome.caseId,
        passed: outcome.passed,
        scores: outcome.scores,
        agent_run_id: outcome.agentRunId,
        error_summary: outcome.errorSummary ?? null,
      })

      onProgress?.({
        type: 'case',
        index: results.length,
        total: fixtures.length,
        caseId: outcome.caseId,
        passed: outcome.passed,
      })

      // Small gap to ease rate limits
      await new Promise((r) => setTimeout(r, 400))
    }

    const passed = results.filter((r) => r.passed).length
    const failed = results.length - passed
    const durationMs = Date.now() - suiteStarted

    await service
      .from('agent_eval_runs')
      .update({
        status: 'completed',
        passed,
        failed,
        total_cases: results.length,
        duration_ms: durationMs,
        summary: {
          caseIds: results.map((r) => r.caseId),
        },
      })
      .eq('id', evalRunId)

    return {
      data: {
        evalRunId,
        passed,
        failed,
        total: results.length,
        durationMs,
        results,
      },
    }
  } catch (e) {
    console.error('eval suite failed:', e instanceof Error ? e.name : 'Error')
    await service
      .from('agent_eval_runs')
      .update({
        status: 'failed',
        duration_ms: Date.now() - suiteStarted,
        summary: { error: EVAL_FAILED_MESSAGE },
        passed: results.filter((r) => r.passed).length,
        failed: results.length - results.filter((r) => r.passed).length,
        total_cases: results.length,
      })
      .eq('id', evalRunId)

    return { error: EVAL_FAILED_MESSAGE }
  }
}

/** Analyst suite: injected book, real analyst tools, no ledger writes. */
export function runPortfolioAnalystEvalSuite(
  adminUserId: string,
  onProgress?: (event: EvalSuiteProgress) => void
) {
  return runEvalSuite(adminUserId, ANALYST_FEATURE, runAnalystCase, onProgress)
}

/** Orchestrator suite: routing only. Specialists are not called. */
export function runOrchestratorEvalSuite(
  adminUserId: string,
  onProgress?: (event: EvalSuiteProgress) => void
) {
  return runEvalSuite(adminUserId, ORCHESTRATOR_FEATURE, runOrchestratorCase, onProgress)
}
