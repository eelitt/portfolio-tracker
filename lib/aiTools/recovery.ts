/**
 * Map stable failureMode codes → recovery strategy (control plane).
 * Used by tools + unit tests; models should follow `recovery` on failures.
 */

export type RecoveryStrategy =
  | 'retry_same'
  | 'fallback_simpler'
  | 'ask_user'
  | 'abort'

export type ToolFailureEnvelope = {
  ok: false
  error: string
  failureMode: string
  recovery: RecoveryStrategy
  retryable: boolean
  /** Optional extra machine fields */
  errors?: string[]
  dryRun?: boolean
  wouldHave?: string
}

const RECOVERY_BY_MODE: Record<
  string,
  { recovery: RecoveryStrategy; retryable: boolean }
> = {
  // Transient / providers
  provider_unavailable: { recovery: 'retry_same', retryable: true },
  empty_response: { recovery: 'retry_same', retryable: true },
  // Fallbacks
  cooldown_store_hit: { recovery: 'fallback_simpler', retryable: false },
  hash_short_circuit: { recovery: 'fallback_simpler', retryable: false },
  rate_limited: { recovery: 'fallback_simpler', retryable: false },
  // User input
  validation_incomplete: { recovery: 'ask_user', retryable: false },
  validation_invalid: { recovery: 'ask_user', retryable: false },
  no_explicit_confirm: { recovery: 'ask_user', retryable: false },
  same_turn_as_prepare: { recovery: 'ask_user', retryable: false },
  no_pending_draft: { recovery: 'ask_user', retryable: false },
  missing_symbol_or_qty: { recovery: 'ask_user', retryable: false },
  // Hard stops
  not_configured: { recovery: 'abort', retryable: false },
  not_authenticated: { recovery: 'abort', retryable: false },
  empty_portfolio: { recovery: 'abort', retryable: false },
  insert_failed: { recovery: 'abort', retryable: false },
  registry_invariant: { recovery: 'abort', retryable: false },
  unknown_tool: { recovery: 'abort', retryable: false },
  not_a_write_tool: { recovery: 'abort', retryable: false },
  dry_run_blocked_write: { recovery: 'ask_user', retryable: false },
  eval_mode_no_persist: { recovery: 'abort', retryable: false },
  elevated_confirm_required: { recovery: 'ask_user', retryable: false },
  validation_failed: { recovery: 'ask_user', retryable: false },
  portfolio_load_failed: { recovery: 'abort', retryable: false },
  invalid_scenario_args: { recovery: 'ask_user', retryable: false },
  estimate_failed: { recovery: 'abort', retryable: false },
  dry_run_no_live_analysis: { recovery: 'fallback_simpler', retryable: false },
}

export function recoveryForFailureMode(failureMode: string): {
  recovery: RecoveryStrategy
  retryable: boolean
} {
  return (
    RECOVERY_BY_MODE[failureMode] ?? {
      recovery: 'abort',
      retryable: false,
    }
  )
}

/** Build a standard failure payload for tools / gates. */
export function toolFailure(
  failureMode: string,
  error: string,
  extra?: Partial<ToolFailureEnvelope>
): ToolFailureEnvelope {
  const { recovery, retryable } = recoveryForFailureMode(failureMode)
  return {
    ok: false,
    error,
    failureMode,
    recovery,
    retryable,
    ...extra,
  }
}

/** Attach recovery fields to an existing gate-style error object. */
export function withRecovery<T extends { failureMode?: string; error?: string; errors?: string[] }>(
  payload: T
): T & { recovery?: RecoveryStrategy; retryable?: boolean } {
  if (!payload.failureMode) return payload
  const { recovery, retryable } = recoveryForFailureMode(payload.failureMode)
  return { ...payload, recovery, retryable }
}
