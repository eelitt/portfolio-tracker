/**
 * Parent-run routing debug for the orchestrator.
 * Stores the question and which invoke_* ran. Not specialist prose.
 */

import type { AgentToolRecord } from './types'

/** Same cap as the sanitized last user message (ANALYST_MAX_LAST_USER_CHARS). */
export const ORCHESTRATOR_USER_TEXT_MAX = 4_000

export type OrchestratorRouteEntry = {
  name: string
  ok: boolean
  task?: string
  universe?: string
  forceRefresh?: boolean
  mode?: string
  symbols?: string[]
}

/** Trimmed question stored on the parent agent_runs row. Empty becomes ''. */
export function clipOrchestratorUserText(text: string): string {
  return text.trim().slice(0, ORCHESTRATOR_USER_TEXT_MAX)
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const symbols = value.filter((s): s is string => typeof s === 'string')
  return symbols.length > 0 ? symbols : undefined
}

/**
 * One entry per invoke_* tool, in call order.
 * Copies only routing args. Drops briefs, hints, and news payloads.
 */
export function buildOrchestratorRoute(
  tools: AgentToolRecord[]
): OrchestratorRouteEntry[] {
  const out: OrchestratorRouteEntry[] = []
  for (const tool of tools) {
    if (!tool.name.startsWith('invoke_')) continue
    const args = tool.args ?? {}
    const entry: OrchestratorRouteEntry = { name: tool.name, ok: tool.ok }
    if (typeof args.task === 'string') entry.task = args.task
    if (typeof args.universe === 'string') entry.universe = args.universe
    if (typeof args.forceRefresh === 'boolean') entry.forceRefresh = args.forceRefresh
    if (typeof args.mode === 'string') entry.mode = args.mode
    const symbols = stringList(args.symbols)
    if (symbols) entry.symbols = symbols
    out.push(entry)
  }
  return out
}

/** Read meta.route from a stored row. Drops malformed entries. */
export function readOrchestratorRoute(value: unknown): OrchestratorRouteEntry[] {
  if (!Array.isArray(value)) return []
  const out: OrchestratorRouteEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.name !== 'string' || typeof row.ok !== 'boolean') continue
    const entry: OrchestratorRouteEntry = { name: row.name, ok: row.ok }
    if (typeof row.task === 'string') entry.task = row.task
    if (typeof row.universe === 'string') entry.universe = row.universe
    if (typeof row.forceRefresh === 'boolean') entry.forceRefresh = row.forceRefresh
    if (typeof row.mode === 'string') entry.mode = row.mode
    const symbols = stringList(row.symbols)
    if (symbols) entry.symbols = symbols
    out.push(entry)
  }
  return out
}
