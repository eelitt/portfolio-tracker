/**
 * Portfolio multi-agent chat endpoint (public path kept for useChat clients).
 *
 * POST { messages } → data stream.
 * Orchestrator streamText + invoke_news_agent / invoke_portfolio_analyst.
 * Parent agent_runs + child runs from specialists.
 */

import { streamText, convertToCoreMessages } from 'ai'
import { xai } from '@ai-sdk/xai'
import { createClient } from '@/lib/supabase/server'
import { checkAndConsumeAnalystRateLimit } from '@/app/actions/ai/portfolio-analyst/rateLimit'
import { sanitizeAnalystMessages } from '@/app/actions/ai/portfolio-analyst/sanitizeMessages'
import { ORCHESTRATOR_SYSTEM_PROMPT } from '@/app/actions/ai/orchestrator/prompt'
import { createOrchestratorTools } from '@/app/actions/ai/orchestrator/tools'
import {
  startAgentRun,
  finishAgentRun,
} from '@/lib/agentObservability/recordRun'
import { toolRecordsFromStepResults } from '@/lib/agentObservability'
import type { AgentToolRecord } from '@/lib/agentObservability'

/** News + analyst can exceed 60s on cold paths. */
export const maxDuration = 180

const MODEL_ID = 'grok-4.3'
const FEATURE = 'portfolio_orchestrator'

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

    const startedAt = Date.now()
    const parentRunId = await startAgentRun({
      userId: user.id,
      feature: FEATURE,
      model: MODEL_ID,
      agentRole: 'orchestrator',
    })

    const collectedTools: AgentToolRecord[] = []
    let stepCount = 0

    const result = streamText({
      model: xai(MODEL_ID),
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: convertToCoreMessages(sanitized.messages as Parameters<
        typeof convertToCoreMessages
      >[0]),
      tools: createOrchestratorTools({
        userId: user.id,
        parentRunId,
        lastUserText: sanitized.lastUserText,
      }),
      maxSteps: 6,
      temperature: 0.2,
      onStepFinish: async (step) => {
        stepCount += 1
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
            'Orchestrator tool log step error:',
            e instanceof Error ? e.message : 'unknown'
          )
        }
      },
      onFinish: async ({ usage, finishReason }) => {
        if (!parentRunId) return
        const status =
          finishReason === 'error' || finishReason === 'other'
            ? 'partial'
            : 'success'
        await finishAgentRun({
          runId: parentRunId,
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
          agentRole: 'orchestrator',
          meta: {
            agent_role: 'orchestrator',
            invoked_agents: collectedTools.map((t) => t.name),
          },
        })
      },
      onError: ({ error }) => {
        const name = error instanceof Error ? error.name : 'Error'
        const msg = error instanceof Error ? error.message : 'unknown'
        console.error('Orchestrator stream error:', name, msg)
        if (parentRunId) {
          void finishAgentRun({
            runId: parentRunId,
            status: 'error',
            tools: collectedTools,
            model: MODEL_ID,
            durationMs: Date.now() - startedAt,
            stepCount,
            errorSummary: `${name}: ${msg}`.slice(0, 500),
            agentRole: 'orchestrator',
          })
        }
      },
    })

    return result.toDataStreamResponse()
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error'
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('Orchestrator route error:', name, msg)
    return new Response('Failed to run portfolio assistant. Please try again.', {
      status: 500,
    })
  }
}
