/**
 * What a Runs-tab filter is allowed to send to the agent_runs query.
 * The action applies the result. It does not invent a second rule.
 */

import type { AgentRunStatus } from './types'

const STATUSES = new Set<AgentRunStatus>([
  'running',
  'success',
  'error',
  'partial',
])

/** Features the app writes as their own rows. The Runs filter lists these. */
export const RUN_FILTER_FEATURES = [
  'portfolio_orchestrator',
  'portfolio_analyst',
  'portfolio_analysis_agent',
  'portfolio_insights',
  'holding_news_agent',
  'holding_news_search',
  'holding_news_impact',
  'csv_import',
  'tax_agent',
] as const

export type AgentRunListFilters = {
  userId?: string
  feature?: string
  status?: AgentRunStatus
  /** Inclusive ISO timestamp. */
  from?: string
  /** Inclusive ISO timestamp. */
  to?: string
}

export function agentRunListFilters(input: {
  userId?: string
  feature?: string
  status?: string
  from?: string
  to?: string
}): AgentRunListFilters {
  const filters: AgentRunListFilters = {}
  const userId = input.userId?.trim()
  if (userId) filters.userId = userId
  const feature = input.feature?.trim()
  if (feature) filters.feature = feature
  if (input.status && STATUSES.has(input.status as AgentRunStatus)) {
    filters.status = input.status as AgentRunStatus
  }
  const from = isoTimestamp(input.from)
  if (from) filters.from = from
  const to = isoTimestamp(input.to)
  if (to) filters.to = to
  return filters
}

/**
 * Start or end of a local calendar day (`YYYY-MM-DD`).
 * The Runs date inputs are the admin's local day, not a UTC date.
 */
export function localDayBound(
  day: string,
  edge: 'start' | 'end'
): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim())
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const date = Number(match[3])
  const stamp = new Date(
    year,
    month - 1,
    date,
    edge === 'start' ? 0 : 23,
    edge === 'start' ? 0 : 59,
    edge === 'start' ? 0 : 59,
    edge === 'start' ? 0 : 999
  )
  if (
    stamp.getFullYear() !== year ||
    stamp.getMonth() !== month - 1 ||
    stamp.getDate() !== date
  ) {
    return undefined
  }
  return stamp.toISOString()
}

function isoTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return undefined
  return trimmed
}
