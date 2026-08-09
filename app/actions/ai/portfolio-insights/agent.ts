/**
 * Portfolio Analysis Agent — thin specialist for orchestrator + shared with Summary UI path.
 * Pipeline: generatePortfolioInsights (hash short-circuit + generateObject).
 */

import 'server-only'

import { generatePortfolioInsights } from './generatePortfolioInsights'
import {
  finishChildAgentRun,
  startChildAgentRun,
} from '@/lib/agents/runChildAgent'
import type {
  ChildAgentContext,
  PortfolioAnalysisAgentOutput,
} from '@/lib/agents/types'
import type { AgentToolRecord } from '@/lib/agentObservability'

const FEATURE = 'portfolio_analysis_agent'
const MODEL = 'grok-4.3'

export type PortfolioAnalysisAgentInput = {
  /** Force a new LLM pass even if hash matches — not exposed by default. */
  force?: boolean
}

/**
 * Run portfolio analysis for the current session user (generatePortfolioInsights uses session).
 */
export async function runPortfolioAnalysisAgent(
  ctx: ChildAgentContext,
  _input: PortfolioAnalysisAgentInput = {}
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
    const result = await generatePortfolioInsights()

    if ('error' in result && result.error) {
      toolTrace.push({
        name: 'generate_portfolio_insights',
        args: {},
        result: { error: result.error },
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
      return { ok: false, error: result.error, toolTrace }
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
    const hadMessage =
      'message' in result && typeof result.message === 'string'

    toolTrace.push({
      name: 'generate_portfolio_insights',
      args: {},
      result: {
        count: insights.length,
        reusedExisting: hadMessage,
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
      toolTrace,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analysis agent failed'
    toolTrace.push({
      name: 'generate_portfolio_insights',
      args: {},
      ok: false,
      error: msg,
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
    return { ok: false, error: msg, toolTrace }
  }
}
