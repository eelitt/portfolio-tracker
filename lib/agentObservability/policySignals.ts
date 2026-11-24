/**
 * Code flags for a chat turn. No classifier. Stored on agent_runs.meta.
 */

import { textHasPromptCanary } from '@/lib/aiTools/promptCanary'
import { redactSecrets } from './redact'

export const ASSISTANT_TEXT_MAX = 2_000

export type PolicySignals = {
  prompt_leak: boolean
  no_specialist: boolean
  watchlist_write: boolean
  prepare_ran: boolean
  answered_without_tools: boolean
}

export function clipAssistantText(text: string): string {
  return redactSecrets(text.trim().slice(0, ASSISTANT_TEXT_MAX))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function policySignalsForOrchestrator(args: {
  assistantText: string
  invokeResults: Array<{ name: string; result: unknown }>
}): PolicySignals {
  let promptLeak = textHasPromptCanary(args.assistantText)
  let watchlistWrite = false
  let prepareRan = false
  let answeredWithoutTools = false

  for (const call of args.invokeResults) {
    const result = asRecord(call.result)
    if (!result) continue
    if (typeof result.text === 'string' && textHasPromptCanary(result.text)) {
      promptLeak = true
    }
    if (typeof result.brief === 'string' && textHasPromptCanary(result.brief)) {
      promptLeak = true
    }
    if (result.watchlistChanged === true) watchlistWrite = true
    const toolNames = stringList(result.toolNames)
    if (toolNames.includes('prepare_transaction')) prepareRan = true
    if (
      call.name === 'invoke_portfolio_analyst' &&
      typeof result.text === 'string' &&
      result.text.trim().length > 0 &&
      Array.isArray(result.toolNames) &&
      toolNames.length === 0
    ) {
      answeredWithoutTools = true
    }
  }

  const reply = args.assistantText.trim()
  return {
    prompt_leak: promptLeak,
    no_specialist: reply.length > 0 && args.invokeResults.length === 0,
    watchlist_write: watchlistWrite,
    prepare_ran: prepareRan,
    answered_without_tools: answeredWithoutTools,
  }
}

/** Signals that belong on the analyst child. Omits no_specialist. */
export function policySignalsForAnalyst(args: {
  assistantText: string
  toolNames: string[]
  watchlistChanged: boolean
  prepareRan: boolean
}): Pick<
  PolicySignals,
  | 'prompt_leak'
  | 'watchlist_write'
  | 'prepare_ran'
  | 'answered_without_tools'
> {
  const reply = args.assistantText.trim()
  return {
    prompt_leak: textHasPromptCanary(reply),
    watchlist_write: args.watchlistChanged,
    prepare_ran: args.prepareRan,
    answered_without_tools: reply.length > 0 && args.toolNames.length === 0,
  }
}
