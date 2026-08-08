/**
 * Start/finish child agent_runs under an orchestrator parent.
 * Best-effort: never throws to specialist callers.
 */

import 'server-only'

import {
  finishAgentRun,
  startAgentRun,
} from '@/lib/agentObservability/recordRun'
import type {
  AgentRunMeta,
  AgentRunStatus,
  AgentToolRecord,
  TokenUsage,
} from '@/lib/agentObservability'
import type { AgentRole } from './types'

export async function startChildAgentRun(input: {
  userId: string
  feature: string
  agentRole: AgentRole
  parentRunId: string | null
  model?: string
  meta?: AgentRunMeta
}): Promise<string | null> {
  return startAgentRun({
    userId: input.userId,
    feature: input.feature,
    model: input.model,
    meta: {
      ...input.meta,
      agent_role: input.agentRole,
      parent_run_id: input.parentRunId ?? undefined,
    },
    parentRunId: input.parentRunId,
    agentRole: input.agentRole,
  })
}

export async function finishChildAgentRun(input: {
  runId: string | null
  status: Exclude<AgentRunStatus, 'running'>
  tools: AgentToolRecord[]
  usage?: TokenUsage | null
  model?: string | null
  durationMs?: number
  stepCount?: number
  errorSummary?: string | null
  meta?: AgentRunMeta
  parentRunId?: string | null
  agentRole?: AgentRole
}): Promise<void> {
  if (!input.runId) return
  await finishAgentRun({
    runId: input.runId,
    status: input.status,
    tools: input.tools,
    usage: input.usage,
    model: input.model,
    durationMs: input.durationMs,
    stepCount: input.stepCount,
    errorSummary: input.errorSummary,
    meta: {
      ...input.meta,
      agent_role: input.agentRole,
      parent_run_id: input.parentRunId ?? undefined,
    },
    parentRunId: input.parentRunId,
    agentRole: input.agentRole,
  })
}
