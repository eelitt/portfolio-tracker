/**
 * News Agent — research specialist for the multi-agent orchestrator.
 *
 * Never invents portfolio numbers. Returns content (brief + holdings) for the
 * orchestrator to present; updates holding-news storage on live fetch.
 * Does not expose cache jargon to the chat model payload (see orchestrator tools).
 */

import 'server-only'

import { runHoldingNews } from './service'
import { buildNewsBrief } from './newsUtils'
import {
  finishChildAgentRun,
  startChildAgentRun,
} from '@/lib/agents/runChildAgent'
import type {
  ChildAgentContext,
  NewsAgentInput,
  NewsAgentOutput,
  NewsHoldingResult,
} from '@/lib/agents/types'
import type { AgentToolRecord } from '@/lib/agentObservability'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'

const FEATURE = 'holding_news_agent'
const MODEL = 'pipeline'

/**
 * Run the News Agent for the given user and input.
 * Default mode: auto freshness (silent store hit or live + persist).
 */
export async function runNewsAgent(
  ctx: ChildAgentContext,
  input: NewsAgentInput
): Promise<NewsAgentOutput> {
  const startedAt = Date.now()
  const runId = await startChildAgentRun({
    userId: ctx.userId,
    feature: FEATURE,
    agentRole: 'news',
    parentRunId: ctx.parentRunId,
    model: MODEL,
  })

  const toolTrace: AgentToolRecord[] = []

  try {
    const result = await runHoldingNews({
      userId: ctx.userId,
      forceRefresh: input.forceRefresh === true,
      mode: input.forceRefresh === true ? 'ui' : 'auto',
      symbols: input.symbols,
    })

    toolTrace.push({
      name: result.fromCache ? 'holding_news_store_hit' : 'holding_news_live',
      args: {
        symbols: input.symbols ?? null,
        forceRefresh: input.forceRefresh === true,
        questionHint: input.questionHint?.slice(0, 200) ?? null,
      },
      result: {
        fromCache: result.fromCache,
        updatedCache: result.updatedCache,
        hasError: Boolean(result.error),
      },
      ok: !result.error,
      error: result.error,
    })

    if (result.error || !result.news) {
      const err = result.error || 'No news payload'
      await finishChildAgentRun({
        runId,
        status: 'error',
        tools: toolTrace,
        model: MODEL,
        durationMs: Date.now() - startedAt,
        errorSummary: err,
        parentRunId: ctx.parentRunId,
        agentRole: 'news',
      })
      return {
        ok: false,
        fromCache: false,
        updatedCache: false,
        holdings: [],
        error: err,
        toolTrace,
      }
    }

    const success = result as {
      news: Record<string, string[]>
      impact?: Record<string, HoldingNewsImpactEntry>
      fromCache?: boolean
      updatedCache?: boolean
      nextRefreshAt?: string
      windowFrom?: string
      windowTo?: string
      contentFetchedAt?: string
      lastCheckedAt?: string
    }

    const holdings: NewsHoldingResult[] = []
    for (const [symbol, bullets] of Object.entries(success.news)) {
      const imp = success.impact?.[symbol]
      holdings.push({
        symbol,
        bullets: (bullets || []).slice(0, 3),
        impact: imp
          ? {
              tone: imp.tone,
              outlook: imp.outlook,
              points: imp.points?.slice(0, 3),
            }
          : undefined,
      })
    }

    // Surface material / negative-leaning items first for "any important news?"
    holdings.sort((a, b) => {
      const aHas = a.bullets.length > 0 ? 0 : 1
      const bHas = b.bullets.length > 0 ? 0 : 1
      if (aHas !== bHas) return aHas - bHas
      const rank = (t?: string) => {
        const x = (t || '').toLowerCase()
        if (x === 'negative') return 0
        if (x === 'mixed') return 1
        if (x === 'positive') return 2
        return 3
      }
      return rank(a.impact?.tone) - rank(b.impact?.tone)
    })

    const brief = buildNewsBrief(holdings)
    const asOf =
      success.contentFetchedAt ||
      success.lastCheckedAt ||
      undefined

    const output: NewsAgentOutput = {
      ok: true,
      fromCache: success.fromCache === true,
      updatedCache: success.updatedCache === true,
      nextRefreshAt: success.nextRefreshAt,
      windowFrom: success.windowFrom,
      windowTo: success.windowTo,
      holdings,
      brief,
      asOf,
      toolTrace,
    }

    await finishChildAgentRun({
      runId,
      status: 'success',
      tools: toolTrace,
      model: MODEL,
      durationMs: Date.now() - startedAt,
      stepCount: 1,
      parentRunId: ctx.parentRunId,
      agentRole: 'news',
      meta: {
        fromCache: output.fromCache,
        updatedCache: output.updatedCache,
      },
    })

    return output
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'News agent failed'
    await finishChildAgentRun({
      runId,
      status: 'error',
      tools: toolTrace,
      model: MODEL,
      durationMs: Date.now() - startedAt,
      errorSummary: msg,
      parentRunId: ctx.parentRunId,
      agentRole: 'news',
    })
    return {
      ok: false,
      fromCache: false,
      updatedCache: false,
      holdings: [],
      error: msg,
      toolTrace,
    }
  }
}
