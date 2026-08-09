/**
 * Runtime gates for write-class tools (MCP-flavored permissions).
 * Reuses confirmGate language; single place for “writes need confirmation”.
 */

import { getTool } from './registry'
import { isExplicitConfirmMessage } from '@/app/actions/ai/portfolio-analyst/confirmGate'

export type WriteGateInput = {
  toolId: string
  lastUserText: string
  /** True if prepare_transaction already ran in this agent HTTP request */
  preparedThisRequest: boolean
  hasPendingDraft: boolean
  evalMode?: boolean
}

export type WriteGateResult =
  | { ok: true }
  | { ok: false; errors: string[]; failureMode: string }

/**
 * Ensure registry marks the tool as a confirmed write, then apply turn/confirm/draft rules.
 */
export function assertWriteAllowed(input: WriteGateInput): WriteGateResult {
  const meta = getTool(input.toolId)
  if (!meta) {
    return {
      ok: false,
      errors: [`Unknown tool "${input.toolId}".`],
      failureMode: 'unknown_tool',
    }
  }
  if (meta.sideEffect !== 'write') {
    return {
      ok: false,
      errors: [`Tool "${input.toolId}" is not a write tool.`],
      failureMode: 'not_a_write_tool',
    }
  }
  if (!meta.requiresConfirmation) {
    return {
      ok: false,
      errors: [
        `Tool "${input.toolId}" is write but not marked requiresConfirmation (registry invariant).`,
      ],
      failureMode: 'registry_invariant',
    }
  }

  if (input.preparedThisRequest) {
    return {
      ok: false,
      errors: [
        'Cannot confirm in the same turn as prepare. Show the draft summary and wait for the user to reply "confirm" in a new message.',
      ],
      failureMode: 'same_turn_as_prepare',
    }
  }

  if (!isExplicitConfirmMessage(input.lastUserText)) {
    return {
      ok: false,
      errors: [
        'User has not sent an explicit confirmation message (e.g. "confirm" or "yes"). Do not save yet.',
      ],
      failureMode: 'no_explicit_confirm',
    }
  }

  // Eval exercises gates without requiring a real pending draft
  if (input.evalMode) {
    return { ok: true }
  }

  if (!input.hasPendingDraft) {
    return {
      ok: false,
      errors: [
        'No pending draft to confirm. Ask the user to describe the trade again, then call prepare_transaction.',
      ],
      failureMode: 'no_pending_draft',
    }
  }

  return { ok: true }
}
