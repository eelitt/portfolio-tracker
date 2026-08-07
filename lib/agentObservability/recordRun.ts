/**
 * Persist agent_runs via the service-role client.
 *
 * Call sites (chat route, eval suite) must treat these as best-effort:
 * logging failure must never break the user-facing stream/response.
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase/admin'
import { estimateCostUsd } from './cost'
import { deriveConfirmMeta } from './score'
import {
  AGENT_RUN_SCHEMA_VERSION,
  type AgentRunMeta,
  type AgentRunStatus,
  type AgentToolRecord,
  type TokenUsage,
} from './types'

export type StartAgentRunInput = {
  userId: string
  feature: string
  model?: string
  meta?: AgentRunMeta
}

/**
 * Insert a row with status=running. Returns run id, or null if insert fails
 * (missing migration, env, etc.).
 */
export async function startAgentRun(
  input: StartAgentRunInput
): Promise<string | null> {
  try {
    const service = createServiceClient()
    const { data, error } = await service
      .from('agent_runs')
      .insert({
        user_id: input.userId,
        feature: input.feature,
        schema_version: AGENT_RUN_SCHEMA_VERSION,
        status: 'running' satisfies AgentRunStatus,
        model: input.model ?? null,
        meta: input.meta ?? {},
        tools: [],
      })
      .select('id')
      .single()

    if (error || !data?.id) {
      console.error('startAgentRun failed:', error?.message ?? 'no id')
      return null
    }
    return data.id as string
  } catch (e) {
    console.error(
      'startAgentRun error:',
      e instanceof Error ? e.message : 'unknown'
    )
    return null
  }
}

export type FinishAgentRunInput = {
  runId: string
  status: Exclude<AgentRunStatus, 'running'>
  tools: AgentToolRecord[]
  usage?: TokenUsage | null
  model?: string | null
  durationMs?: number
  stepCount?: number
  errorSummary?: string | null
  meta?: AgentRunMeta
}

/**
 * Finalize a run: tools, usage, cost estimate, confirm meta.
 * Swallows errors so callers stay safe.
 */
export async function finishAgentRun(input: FinishAgentRunInput): Promise<void> {
  try {
    const confirmMeta = deriveConfirmMeta(input.tools)
    // Caller meta wins on key collisions (e.g. eval_case_id).
    const meta: AgentRunMeta = {
      ...confirmMeta,
      ...(input.meta ?? {}),
    }
    const estimated = estimateCostUsd(input.model, input.usage ?? undefined)

    const service = createServiceClient()
    const { error } = await service
      .from('agent_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: input.status,
        tools: input.tools,
        meta,
        duration_ms: input.durationMs ?? null,
        step_count: input.stepCount ?? input.tools.length,
        prompt_tokens: input.usage?.promptTokens ?? null,
        completion_tokens: input.usage?.completionTokens ?? null,
        total_tokens: input.usage?.totalTokens ?? null,
        estimated_cost_usd: estimated,
        error_summary: input.errorSummary
          ? input.errorSummary.slice(0, 500)
          : null,
        ...(input.model != null ? { model: input.model } : {}),
      })
      .eq('id', input.runId)

    if (error) {
      console.error('finishAgentRun failed:', error.message)
    }
  } catch (e) {
    console.error(
      'finishAgentRun error:',
      e instanceof Error ? e.message : 'unknown'
    )
  }
}
