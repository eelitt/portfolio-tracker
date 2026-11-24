/**
 * One agent_runs row for a model call that is not already the orchestrator
 * or analyst child. Best-effort, same as startAgentRun.
 */

import 'server-only'

import type { TokenUsage } from '@/lib/agentObservability'
import { logSubject } from '@/lib/agentObservability/caller'
import {
  finishAgentRun,
  startAgentRun,
} from '@/lib/agentObservability/recordRun'

export async function recordModelUsage(input: {
  userId: string
  feature: string
  model: string
  usage: TokenUsage | null
  status?: 'success' | 'error'
  errorSummary?: string | null
  /** Chat orchestrator id. Omitted for a button that is not chat. */
  parentRunId?: string | null
  /** Short line when the row has no user question. Empty stores nothing. */
  subject?: string | null
}): Promise<void> {
  const subject = logSubject(input.subject)
  const runId = await startAgentRun({
    userId: input.userId,
    feature: input.feature,
    model: input.model,
    parentRunId: input.parentRunId,
    meta: subject ? { subject } : undefined,
  })
  if (!runId) return
  await finishAgentRun({
    runId,
    status: input.status ?? 'success',
    tools: [],
    usage: input.usage,
    model: input.model,
    errorSummary: input.errorSummary,
    meta: subject ? { subject } : undefined,
  })
}
