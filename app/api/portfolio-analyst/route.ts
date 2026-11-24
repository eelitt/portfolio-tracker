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
import type { AgentRunMeta, AgentToolRecord } from '@/lib/agentObservability'
import {
  buildOrchestratorRoute,
  clipOrchestratorUserText,
} from '@/lib/agentObservability/routeMeta'
import {
  clipAssistantText,
  policySignalsForOrchestrator,
} from '@/lib/agentObservability/policySignals'
import { attachFencedContext } from '@/lib/aiTools/promptFence'
import {
  buildUserContext,
  formatUserContextForPrompt,
} from '@/lib/aiTools/buildUserContext'
import { resolveDryRun } from '@/lib/aiTools'
import { persistAnalystChatTurn } from '@/app/actions/ai/portfolio-analyst/chatHistoryActions'
import {
  checkAiAllowance,
  endAiEntry,
  tryBeginAiEntry,
} from '@/lib/aiUsage/allowance'

/** News + analyst can exceed 60s on cold paths. */
export const maxDuration = 180

const MODEL_ID = 'grok-4.3'
const FEATURE = 'portfolio_orchestrator'

function orchestratorRunMeta(args: {
  dryRun: boolean
  lastUserText: string
  tools: AgentToolRecord[]
  assistantText: string
  invokeResults: Array<{ name: string; result: unknown }>
}): AgentRunMeta {
  const userText = clipOrchestratorUserText(args.lastUserText)
  const assistantText = clipAssistantText(args.assistantText)
  return {
    agent_role: 'orchestrator',
    invoked_agents: args.tools.map((t) => t.name),
    route: buildOrchestratorRoute(args.tools),
    policy_signals: policySignalsForOrchestrator({
      assistantText: args.assistantText,
      invokeResults: args.invokeResults,
    }),
    ...(args.dryRun ? { dry_run: true } : {}),
    ...(userText ? { user_text: userText } : {}),
    ...(assistantText ? { assistant_text: assistantText } : {}),
  }
}

export async function POST(req: Request) {
  let releaseEntry = async () => {}
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

    const bodyObj = body as { messages?: unknown; dryRun?: unknown }
    const rawMessages = Array.isArray(bodyObj.messages)
      ? bodyObj.messages
      : []

    const sanitized = sanitizeAnalystMessages(rawMessages)
    if (!sanitized.ok) {
      return new Response(sanitized.error, { status: sanitized.status })
    }

    const dryRun = resolveDryRun({
      bodyDryRun: bodyObj.dryRun === true,
      lastUserText: sanitized.lastUserText,
    })

    const allowance = await checkAiAllowance(user.id)
    if (!allowance.allowed) {
      return new Response(allowance.message, { status: 402 })
    }

    const entry = await tryBeginAiEntry(user.id)
    if (!entry.ok) {
      return new Response(entry.message, { status: 429 })
    }
    let entryReleased = false
    releaseEntry = async () => {
      if (entryReleased) return
      entryReleased = true
      await endAiEntry(user.id, entry.token)
    }

    // Dry-run still paced (outer LLM cost); same soft limit as normal chat
    const rate = await checkAndConsumeAnalystRateLimit(user.id)
    if (!rate.allowed) {
      await releaseEntry()
      return new Response(rate.error, { status: 429 })
    }

    const startedAt = Date.now()
    const parentRunId = await startAgentRun({
      userId: user.id,
      feature: FEATURE,
      model: MODEL_ID,
      agentRole: 'orchestrator',
      meta: dryRun ? { dry_run: true } : undefined,
    })

    const collectedTools: AgentToolRecord[] = []
    const invokeResults: Array<{ name: string; result: unknown }> = []
    let stepCount = 0

    let packText = ''
    try {
      const pack = await buildUserContext(user.id)
      packText = formatUserContextForPrompt(pack)
    } catch (e) {
      console.error(
        'User context pack failed:',
        e instanceof Error ? e.message : 'unknown'
      )
    }

    let system = ORCHESTRATOR_SYSTEM_PROMPT
    if (dryRun) {
      system +=
        '\n\n## Dry-run mode (active)\nPreview only: do not claim anything was saved or that live news was refreshed. Prefer tool results marked dryRun / wouldHave. Narrate what would happen after a real confirm.'
    }

    const modelMessages = attachFencedContext(sanitized.messages, packText)

    const result = streamText({
      model: xai(MODEL_ID),
      system,
      messages: convertToCoreMessages(modelMessages as Parameters<
        typeof convertToCoreMessages
      >[0]),
      tools: createOrchestratorTools({
        userId: user.id,
        parentRunId,
        lastUserText: sanitized.lastUserText,
        priorUserText: sanitized.priorUserText,
        dryRun,
      }),
      maxSteps: 6,
      temperature: 0.2,
      onStepFinish: async (step) => {
        stepCount += 1
        try {
          const rawResults = step.toolResults || []
          for (const tr of rawResults) {
            if (tr.toolName.startsWith('invoke_')) {
              invokeResults.push({ name: tr.toolName, result: tr.result })
            }
          }
          const records = toolRecordsFromStepResults(
            rawResults.map((tr) => ({
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
      onFinish: async ({ usage, finishReason, text }) => {
        if (finishReason !== 'error') {
          try {
            await persistAnalystChatTurn({
              userId: user.id,
              requestMessages: sanitized.messages,
              assistantText: typeof text === 'string' ? text : '',
            })
          } catch (e) {
            console.error(
              'Analyst chat persist failed:',
              e instanceof Error ? e.message : 'unknown'
            )
          }
        }

        try {
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
            meta: orchestratorRunMeta({
              dryRun,
              lastUserText: sanitized.lastUserText,
              tools: collectedTools,
              assistantText: typeof text === 'string' ? text : '',
              invokeResults,
            }),
          })
        } finally {
          await releaseEntry()
        }
      },
      onError: ({ error }) => {
        const name = error instanceof Error ? error.name : 'Error'
        console.error('Orchestrator stream error:', name)
        const finish = async () => {
          try {
            if (parentRunId) {
              await finishAgentRun({
                runId: parentRunId,
                status: 'error',
                tools: collectedTools,
                model: MODEL_ID,
                durationMs: Date.now() - startedAt,
                stepCount,
                errorSummary: name,
                agentRole: 'orchestrator',
                meta: orchestratorRunMeta({
                  dryRun,
                  lastUserText: sanitized.lastUserText,
                  tools: collectedTools,
                  assistantText: '',
                  invokeResults,
                }),
              })
            }
          } finally {
            await releaseEntry()
          }
        }
        void finish()
      },
    })

    return result.toDataStreamResponse()
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error'
    console.error('Orchestrator route error:', name)
    await releaseEntry()
    return new Response('Failed to run portfolio assistant. Please try again.', {
      status: 500,
    })
  }
}
