/**
 * Shared types for agent run logging and the eval harness.
 *
 * Stored in Supabase as agent_runs / agent_eval_* (service-role only).
 * `feature` is an open string so other AI call sites can reuse the same tables.
 */

/** Bump when agent_runs.tools / meta JSON shape changes incompatibly. */
export const AGENT_RUN_SCHEMA_VERSION = 1

/** Known feature ids; other strings allowed for future agents. */
export type AgentFeature = 'portfolio_analyst' | (string & {})

export type AgentRunStatus = 'running' | 'success' | 'error' | 'partial'

/** One tool invocation recorded during a run (args/result already redacted). */
export type AgentToolRecord = {
  name: string
  args: Record<string, unknown>
  /** Truncated tool result — used by admin UI and numeric eval checks. */
  result?: unknown
  latency_ms?: number
  ok: boolean
  error?: string
}

/** Flexible per-run flags (confirm gate, eval case link, etc.). */
export type AgentRunMeta = {
  had_confirm_attempt?: boolean
  confirm_blocked?: boolean
  confirm_success?: boolean
  request_id?: string
  /** Set when the run was produced by the admin eval suite. */
  eval_case_id?: string
  [key: string]: unknown
}

/** Row shape returned to admin actions / UI. */
export type AgentRunRow = {
  id: string
  created_at: string
  finished_at: string | null
  user_id: string
  feature: string
  schema_version: number
  status: AgentRunStatus
  model: string | null
  duration_ms: number | null
  step_count: number
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  tools: AgentToolRecord[]
  meta: AgentRunMeta
  error_summary: string | null
}

/** AI SDK usage fields we persist. */
export type TokenUsage = {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/**
 * Deterministic expectations for an eval fixture.
 * Scored against recorded tools only (not free-form model text).
 */
export type EvalExpect = {
  /** Pass if every name in at least one list appears among called tools. */
  toolsAnyOf?: string[][]
  forbiddenTools?: string[]
  numericFromTools?: Array<{
    /** Optional tool name filter; otherwise search all tool results. */
    tool?: string
    path: string
    equals: number
    tolerance?: number
  }>
  /** Fail if confirm_transaction returned ok: true. */
  mustNotSucceedConfirm?: boolean
  /** Fail if confirm_transaction was called at all. */
  mustNotCallConfirm?: boolean
}

/** JSON fixture shape under lib/agentEval/fixtures/. */
export type EvalCaseFixture = {
  id: string
  feature: string
  description: string
  prompt: string
  seed: {
    transactions: Array<{
      symbol: string
      asset_type: 'stock' | 'etf' | 'crypto' | 'cash'
      action: 'buy' | 'sell' | 'inflow' | 'outflow'
      quantity: number
      unit_price: number
      executed_at: string
      currency?: 'USD' | 'EUR'
      notes?: string
    }>
    preferredCurrency?: 'USD' | 'EUR'
    /** Symbol → USD mark (or { price, change24h }). */
    prices: Record<string, number | { price: number; change24h?: number | null }>
    usdToEurRate?: number
  }
  expect: EvalExpect
}

export type ScoreCheck = {
  name: string
  passed: boolean
  detail?: string
}

export type ScoreResult = {
  passed: boolean
  checks: ScoreCheck[]
}
