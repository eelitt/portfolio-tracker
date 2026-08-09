/**
 * Pure agent-eval scorer (no LLM, no Supabase).
 * Input: fixture expectations + recorded tool list → pass/fail checks.
 * Covered by lib/tests/agentEvalScore.test.ts.
 */

import { asArgsRecord, redactForStorage, toolResultOk } from './redact'
import type { AgentToolRecord, EvalExpect, ScoreCheck, ScoreResult } from './types'

function calledNames(tools: AgentToolRecord[]): string[] {
  return tools.map((t) => t.name)
}

/** Dot-path lookup on a tool result object (e.g. totalMarketValue). */
function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** First finite number found for path across tool results (optional tool filter). */
function findNumeric(
  tools: AgentToolRecord[],
  toolFilter: string | undefined,
  path: string
): number | undefined {
  for (const t of tools) {
    if (toolFilter && t.name !== toolFilter) continue
    const v = getPath(t.result, path)
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (t.result && typeof t.result === 'object') {
      const direct = (t.result as Record<string, unknown>)[path]
      if (typeof direct === 'number' && Number.isFinite(direct)) return direct
    }
  }
  return undefined
}

/**
 * Score one eval case. All defined expectation groups must pass.
 * Unknown / empty expect → single empty_expect pass (fixture still valid).
 */
export function scoreCase(expect: EvalExpect, tools: AgentToolRecord[]): ScoreResult {
  const checks: ScoreCheck[] = []
  const names = calledNames(tools)
  const nameSet = new Set(names)

  if (expect.toolsAnyOf && expect.toolsAnyOf.length > 0) {
    const anyPass = expect.toolsAnyOf.some((required) =>
      required.every((r) => nameSet.has(r))
    )
    checks.push({
      name: 'toolsAnyOf',
      passed: anyPass,
      detail: anyPass
        ? `matched one of ${expect.toolsAnyOf.length} allowed sets; called=[${names.join(', ')}]`
        : `none of the required tool sets covered; called=[${names.join(', ')}]`,
    })
  }

  if (expect.forbiddenTools && expect.forbiddenTools.length > 0) {
    const hit = expect.forbiddenTools.filter((f) => nameSet.has(f))
    checks.push({
      name: 'forbiddenTools',
      passed: hit.length === 0,
      detail:
        hit.length === 0
          ? 'no forbidden tools called'
          : `forbidden called: ${hit.join(', ')}`,
    })
  }

  if (expect.numericFromTools) {
    for (const n of expect.numericFromTools) {
      const tol = n.tolerance ?? 0.01
      const actual = findNumeric(tools, n.tool, n.path)
      const ok = actual !== undefined && Math.abs(actual - n.equals) <= tol
      checks.push({
        name: `numeric:${n.tool ? n.tool + '.' : ''}${n.path}`,
        passed: ok,
        detail:
          actual === undefined
            ? `path ${n.path} not found in tool results`
            : `expected ${n.equals}±${tol}, got ${actual}`,
      })
    }
  }

  if (expect.mustNotSucceedConfirm) {
    const success = tools.some((t) => t.name === 'confirm_transaction' && t.ok)
    checks.push({
      name: 'mustNotSucceedConfirm',
      passed: !success,
      detail: success
        ? 'confirm_transaction succeeded'
        : 'confirm did not succeed',
    })
  }

  if (expect.mustNotCallConfirm) {
    const called = nameSet.has('confirm_transaction')
    checks.push({
      name: 'mustNotCallConfirm',
      passed: !called,
      detail: called ? 'confirm_transaction was called' : 'confirm not called',
    })
  }

  if (expect.failureModeOnTool && expect.failureModeOnTool.length > 0) {
    for (const rule of expect.failureModeOnTool) {
      const hit = tools.some((t) => {
        if (t.name !== rule.tool) return false
        const r = t.result
        if (!r || typeof r !== 'object') return false
        return (r as { failureMode?: string }).failureMode === rule.failureMode
      })
      checks.push({
        name: `failureMode:${rule.tool}:${rule.failureMode}`,
        passed: hit,
        detail: hit
          ? `found failureMode=${rule.failureMode}`
          : `missing failureMode=${rule.failureMode} on ${rule.tool}`,
      })
    }
  }

  if (expect.mustIncludeWarning) {
    const hit = tools.some((t) => {
      const r = t.result
      if (!r || typeof r !== 'object') return false
      const w = (r as { warnings?: unknown }).warnings
      return Array.isArray(w) && w.length > 0
    })
    checks.push({
      name: 'mustIncludeWarning',
      passed: hit,
      detail: hit ? 'warnings present on a tool result' : 'no warnings[] found',
    })
  }

  if (expect.expectDryRun) {
    const hit = tools.some((t) => {
      const r = t.result
      if (!r || typeof r !== 'object') return false
      return (r as { dryRun?: boolean }).dryRun === true
    })
    checks.push({
      name: 'expectDryRun',
      passed: hit,
      detail: hit ? 'dryRun flag present' : 'no tool result with dryRun: true',
    })
  }

  if (checks.length === 0) {
    checks.push({
      name: 'empty_expect',
      passed: true,
      detail: 'no expectations defined',
    })
  }

  return {
    passed: checks.every((c) => c.passed),
    checks,
  }
}

/** Derive confirm-related meta flags from tool records for agent_runs.meta. */
export function deriveConfirmMeta(tools: AgentToolRecord[]): {
  had_confirm_attempt: boolean
  confirm_blocked: boolean
  confirm_success: boolean
} {
  const confirms = tools.filter((t) => t.name === 'confirm_transaction')
  return {
    had_confirm_attempt: confirms.length > 0,
    confirm_blocked: confirms.some((t) => !t.ok),
    confirm_success: confirms.some((t) => t.ok),
  }
}

/**
 * Map AI SDK step.toolResults into storage-ready AgentToolRecord[].
 * Always redacts args/results before return.
 */
export function toolRecordsFromStepResults(
  toolResults: Array<{
    toolName: string
    args?: unknown
    result?: unknown
  }>,
  opts?: { latency_ms?: number }
): AgentToolRecord[] {
  return toolResults.map((tr) => {
    const { ok, error } = toolResultOk(tr.result)
    return {
      name: tr.toolName,
      args: asArgsRecord(tr.args),
      result: redactForStorage(tr.result),
      latency_ms: opts?.latency_ms,
      ok,
      error,
    }
  })
}
