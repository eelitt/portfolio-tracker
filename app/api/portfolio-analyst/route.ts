/**
 * Portfolio Analyst streaming chat endpoint.
 *
 * POST { messages } → data stream for useChat.
 * Auth + analyst rate limit + sanitized history + tool-first streamText (xAI).
 * Best-effort agent_runs logging (does not break the stream on log failure).
 */

import { streamText, convertToCoreMessages } from 'ai'
import { xai } from '@ai-sdk/xai'
import { createClient } from '@/lib/supabase/server'
import { PORTFOLIO_ANALYST_SYSTEM_PROMPT } from '@/app/actions/ai/portfolio-analyst/prompt'
import { createPortfolioAnalystTools } from '@/app/actions/ai/portfolio-analyst/tools'
import { checkAndConsumeAnalystRateLimit } from '@/app/actions/ai/portfolio-analyst/rateLimit'
import { sanitizeAnalystMessages } from '@/app/actions/ai/portfolio-analyst/sanitizeMessages'
import {
  startAgentRun,
  finishAgentRun,
} from '@/lib/agentObservability/recordRun'
import { toolRecordsFromStepResults } from '@/lib/agentObservability'
import type { AgentToolRecord } from '@/lib/agentObservability'

export const maxDuration = 60

const MODEL_ID = 'grok-4.3'
const FEATURE = 'portfolio_analyst'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Not authenticated', { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('access_to_app')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.access_to_app !== true) {
      return new Response('Access denied', { status: 403 })
    }

    if (!process.env.XAI_API_KEY) {
      return new Response('AI service is not configured.', { status: 503 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return new Response('Invalid JSON body.', { status: 400 })
    }

    const rawMessages = Array.isArray((body as { messages?: unknown })?.messages)
      ? ((body as { messages: unknown[] }).messages)
      : []

    const sanitized = sanitizeAnalystMessages(rawMessages)
    if (!sanitized.ok) {
      return new Response(sanitized.error, { status: sanitized.status })
    }

    const rate = await checkAndConsumeAnalystRateLimit(user.id)
    if (!rate.allowed) {
      return new Response(rate.error, { status: 429 })
    }

    // --- Agent observability (best-effort; null runId = logging unavailable) ---
    const startedAt = Date.now()
    const runId = await startAgentRun({
      userId: user.id,
      feature: FEATURE,
      model: MODEL_ID,
    })

    const collectedTools: AgentToolRecord[] = []
    let stepCount = 0

    const result = streamText({
      model: xai(MODEL_ID),
      system: PORTFOLIO_ANALYST_SYSTEM_PROMPT,
      messages: convertToCoreMessages(sanitized.messages as Parameters<
        typeof convertToCoreMessages
      >[0]),
      tools: createPortfolioAnalystTools(user.id, {
        lastUserText: sanitized.lastUserText,
        // Intentionally omit evalPortfolio / evalMode — production chat only.
      }),
      maxSteps: 5,
      temperature: 0.2,
      onStepFinish: async (step) => {
        stepCount += 1
        // Collect tool traces for agent_runs; never throw into the stream.
        try {
          const records = toolRecordsFromStepResults(
            (step.toolResults || []).map((tr) => ({
              toolName: tr.toolName,
              args: tr.args,
              result: tr.result,
            }))
          )
          collectedTools.push(...records)
        } catch (e) {
          console.error(
            'Portfolio analyst tool log step error:',
            e instanceof Error ? e.message : 'unknown'
          )
        }
      },
      onFinish: async ({ usage, finishReason }) => {
        if (!runId) return
        const status =
          finishReason === 'error' || finishReason === 'other'
            ? 'partial'
            : 'success'
        await finishAgentRun({
          runId,
          status,
          tools: collectedTools,
          usage: usage
            ? {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
              }
            : null,
          model: MODEL_ID,
          durationMs: Date.now() - startedAt,
          stepCount,
        })
      },
      onError: ({ error }) => {
        const name = error instanceof Error ? error.name : 'Error'
        const msg = error instanceof Error ? error.message : 'unknown'
        console.error('Portfolio analyst stream error:', name, msg)
        if (runId) {
          void finishAgentRun({
            runId,
            status: 'error',
            tools: collectedTools,
            model: MODEL_ID,
            durationMs: Date.now() - startedAt,
            stepCount,
            errorSummary: `${name}: ${msg}`.slice(0, 500),
          })
        }
      },
    })

    return result.toDataStreamResponse()
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error'
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('Portfolio analyst route error:', name, msg)
    return new Response('Failed to run portfolio analyst. Please try again.', {
      status: 500,
    })
  }
}
