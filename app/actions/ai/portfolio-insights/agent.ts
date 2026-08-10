/**
 * Portfolio Analysis Agent — thin specialist for orchestrator + shared with Summary UI path.
 * Pipeline: generatePortfolioInsights (hash short-circuit + generateObject).
 * Dry-run: stored insights only — no LLM, no package write.
 */

import 'server-only'

import { generatePortfolioInsights } from './generatePortfolioInsights'
import { getLatestAIInsight } from '@/app/actions/ai/storage'
import {
  finishChildAgentRun,
  startChildAgentRun,
} from '@/lib/agents/runChildAgent'
import type {
  ChildAgentContext,
  PortfolioAnalysisAgentInput,
  PortfolioAnalysisAgentOutput,
} from '@/lib/agents/types'
import type { AgentToolRecord } from '@/lib/agentObservability'
import { recoveryForFailureMode } from '@/lib/aiTools'

const FEATURE = 'portfolio_analysis_agent'
const MODEL = 'grok-4.3'
const INSIGHTS_FEATURE = 'portfolio_insights'

function normalizeInsights(insights: unknown): string[] {
  if (Array.isArray(insights)) return insights.map(String).filter(Boolean)
  if (typeof insights === 'string') {
    return insights
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Run portfolio analysis for the current session user (generatePortfolioInsights uses session).
 */
export async function runPortfolioAnalysisAgent(
  ctx: ChildAgentContext,
  input: PortfolioAnalysisAgentInput = {}
): Promise<PortfolioAnalysisAgentOutput> {
  const startedAt = Date.now()
  const runId = await startChildAgentRun({
    userId: ctx.userId,
    feature: FEATURE,
    agentRole: 'portfolio_analysis',
    parentRunId: ctx.parentRunId,
    model: MODEL,
  })

  const toolTrace: AgentToolRecord[] = []

  try {
    // Dry-run: never call LLM or write user_ai_insights
    if (input.dryRun === true) {
      const cached = await getLatestAIInsight(ctx.userId, INSIGHTS_FEATURE)
      const insights = cached
        ? normalizeInsights(cached.result.insights)
        : []
      const brief =
        insights.length > 0
          ? `Portfolio analysis (dry-run — stored only):\n${insights.map((b) => `• ${b}`).join('\n')}`
          : 'Dry-run: no stored portfolio analysis yet. A live run would generate new bullets.'
      const statusNote =
        insights.length > 0
          ? 'Dry-run: showing last stored analysis; nothing was regenerated.'
          : 'Dry-run: no stored analysis; nothing was written.'

      toolTrace.push({
        name: 'generate_portfolio_insights',
        args: { dryRun: true },
        result: {
          count: insights.length,
          packageUpdated: false,
          dryRun: true,
        },
        ok: true,
      })

      await finishChildAgentRun({
        runId,
        status: 'success',
        tools: toolTrace,
        model: MODEL,
        durationMs: Date.now() - startedAt,
        stepCount: 1,
        parentRunId: ctx.parentRunId,
        agentRole: 'portfolio_analysis',
        meta: { dry_run: true },
      })

      return {
        ok: true,
        insights,
        brief,
        asOf: cached?.createdAt,
        statusNote,
        packageUpdated: false,
        dryRun: true,
        failureMode:
          insights.length === 0 ? 'dry_run_no_live_analysis' : undefined,
        recovery:
          insights.length === 0
            ? recoveryForFailureMode('dry_run_no_live_analysis').recovery
            : undefined,
        toolTrace,
      }
    }

    const result = await generatePortfolioInsights()

    if ('error' in result && result.error) {
      const failureMode = /wait|rate/i.test(result.error)
        ? 'rate_limited'
        : /not authenticated/i.test(result.error)
          ? 'not_authenticated'
          : /not configured/i.test(result.error)
            ? 'not_configured'
            : /no portfolio/i.test(result.error)
              ? 'empty_portfolio'
              : 'estimate_failed'
      const { recovery, retryable } = recoveryForFailureMode(failureMode)

      toolTrace.push({
        name: 'generate_portfolio_insights',
        args: {},
        result: {
          error: result.error,
          failureMode,
          recovery,
          retryable,
        },
        ok: false,
        error: result.error,
      })
      await finishChildAgentRun({
        runId,
        status: 'error',
        tools: toolTrace,
        model: MODEL,
        durationMs: Date.now() - startedAt,
        errorSummary: result.error,
        parentRunId: ctx.parentRunId,
        agentRole: 'portfolio_analysis',
      })
      return {
        ok: false,
        error: result.error,
        failureMode,
        recovery,
        toolTrace,
      }
    }

    const insights = (result.insights || []).map(String)
    const brief =
      insights.length > 0
        ? `Portfolio analysis:\n${insights.map((b) => `• ${b}`).join('\n')}`
        : 'No analysis bullets returned.'
    const asOf =
      'cachedAt' in result && typeof result.cachedAt === 'string'
        ? result.cachedAt
        : undefined
    const statusNote =
      'message' in result && typeof result.message === 'string'
        ? result.message
        : undefined
    const packageUpdated =
      'packageUpdated' in result && result.packageUpdated === true

    toolTrace.push({
      name: 'generate_portfolio_insights',
      args: {},
      result: {
        count: insights.length,
        reusedExisting: Boolean(statusNote),
        packageUpdated,
      },
      ok: true,
    })

    await finishChildAgentRun({
      runId,
      status: 'success',
      tools: toolTrace,
      model: MODEL,
      durationMs: Date.now() - startedAt,
      stepCount: 1,
      parentRunId: ctx.parentRunId,
      agentRole: 'portfolio_analysis',
    })

    return {
      ok: true,
      insights,
      brief,
      asOf,
      statusNote,
      packageUpdated,
      toolTrace,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analysis agent failed'
    const { recovery, retryable } = recoveryForFailureMode('estimate_failed')
    toolTrace.push({
      name: 'generate_portfolio_insights',
      args: {},
      ok: false,
      error: msg,
      result: { failureMode: 'estimate_failed', recovery, retryable },
    })
    await finishChildAgentRun({
      runId,
      status: 'error',
      tools: toolTrace,
      model: MODEL,
      durationMs: Date.now() - startedAt,
      errorSummary: msg,
      parentRunId: ctx.parentRunId,
      agentRole: 'portfolio_analysis',
    })
    return {
      ok: false,
      error: msg,
      failureMode: 'estimate_failed',
      recovery,
      toolTrace,
    }
  }
}
