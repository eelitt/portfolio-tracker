/**
 * Live LLM eval suite for Portfolio Analyst (server-only).
 *
 * For each fixture: inject seed portfolio → generateText + tools (evalMode) →
 * pure scoreCase → persist agent_runs + agent_eval_results.
 * Caller must already be admin (API route / server action gate).
 */

import 'server-only'

import { generateText } from 'ai'
import { xai } from '@ai-sdk/xai'
import { PORTFOLIO_ANALYST_SYSTEM_PROMPT } from '@/app/actions/ai/portfolio-analyst/prompt'
import { createPortfolioAnalystTools } from '@/app/actions/ai/portfolio-analyst/tools'
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

const MODEL_ID = 'grok-4.3'
const FEATURE = 'portfolio_analyst'

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

/** One fixture: model call + score + linked agent_run. */
async function runOneCase(
  userId: string,
  fixture: EvalCaseFixture
): Promise<EvalCaseOutcome> {
  const startedAt = Date.now()
  const evalPortfolio = buildEvalPortfolioData(fixture.seed)
  const collected: AgentToolRecord[] = []

  const runId = await startAgentRun({
    userId,
    feature: FEATURE,
    model: MODEL_ID,
    meta: { eval_case_id: fixture.id },
  })

  try {
    const result = await generateText({
      model: xai(MODEL_ID),
      system: PORTFOLIO_ANALYST_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: fixture.prompt }],
      tools: createPortfolioAnalystTools(userId, {
        lastUserText: fixture.prompt,
        evalPortfolio,
        evalMode: true, // no pending drafts / no DB writes from confirm
      }),
      maxSteps: 5,
      temperature: 0.1,
      onStepFinish: (step) => {
        const records = toolRecordsFromStepResults(
          (step.toolResults || []).map((tr) => ({
            toolName: tr.toolName,
            args: tr.args,
            result: tr.result,
          }))
        )
        collected.push(...records)
      },
    })

    // Fallback if step callback did not fire (SDK edge cases)
    if (collected.length === 0 && result.steps) {
      for (const step of result.steps) {
        collected.push(
          ...toolRecordsFromStepResults(
            (step.toolResults || []).map((tr) => ({
              toolName: tr.toolName,
              args: tr.args,
              result: tr.result,
            }))
          )
        )
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
    const msg = e instanceof Error ? e.message : 'unknown'
    if (runId) {
      await finishAgentRun({
        runId,
        status: 'error',
        tools: collected,
        model: MODEL_ID,
        durationMs: Date.now() - startedAt,
        errorSummary: msg.slice(0, 500),
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
      errorSummary: msg.slice(0, 500),
      tools: collected,
    }
  }
}

/**
 * Execute all portfolio_analyst fixtures sequentially.
 * Writes agent_eval_runs / agent_eval_results; gaps between cases ease rate limits.
 */
export async function runPortfolioAnalystEvalSuite(
  adminUserId: string
): Promise<{ data?: EvalSuiteOutcome; error?: string }> {
  if (!process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured (XAI_API_KEY).' }
  }

  const fixtures = loadEvalFixtures(FEATURE)
  if (fixtures.length === 0) {
    return { error: 'No eval fixtures found.' }
  }

  const service = createServiceClient()
  const suiteStarted = Date.now()

  const { data: evalRun, error: insertErr } = await service
    .from('agent_eval_runs')
    .insert({
      started_by: adminUserId,
      feature: FEATURE,
      mode: 'live_llm',
      status: 'running',
      total_cases: fixtures.length,
    })
    .select('id')
    .single()

  if (insertErr || !evalRun?.id) {
    return {
      error: insertErr?.message || 'Failed to create eval run row (migration applied?)',
    }
  }

  const evalRunId = evalRun.id as string
  const results: EvalCaseOutcome[] = []

  try {
    for (const fixture of fixtures) {
      const outcome = await runOneCase(adminUserId, fixture)
      results.push(outcome)

      await service.from('agent_eval_results').insert({
        eval_run_id: evalRunId,
        case_id: outcome.caseId,
        passed: outcome.passed,
        scores: outcome.scores,
        agent_run_id: outcome.agentRunId,
        error_summary: outcome.errorSummary ?? null,
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
    const msg = e instanceof Error ? e.message : 'unknown'
    await service
      .from('agent_eval_runs')
      .update({
        status: 'failed',
        duration_ms: Date.now() - suiteStarted,
        summary: { error: msg },
        passed: results.filter((r) => r.passed).length,
        failed: results.length - results.filter((r) => r.passed).length,
        total_cases: results.length,
      })
      .eq('id', evalRunId)

    return { error: msg }
  }
}
