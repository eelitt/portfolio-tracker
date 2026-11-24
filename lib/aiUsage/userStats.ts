/**
 * Pure per-user counts over agent_runs. Dollars stay in sumUsage.
 */

export const STUCK_RUN_MS = 10 * 60 * 1000
export const LAST_ERROR_MAX = 120

export type UserStatSource = {
  createdAt: string
  feature: string
  status: string
  errorSummary: string | null
  eval: boolean
  confirmBlocked: boolean
}

export type UserUsageStats = {
  calls: number
  errors: number
  mostUsed: { feature: string; count: number } | null
  lastCall: {
    at: string
    feature: string
    status: string
    eval: boolean
  } | null
  lastError: string | null
  confirmBlocked: number
  stuck: number
}

function atMs(iso: string): number | null {
  const at = new Date(iso).getTime()
  return Number.isNaN(at) ? null : at
}

function clipError(text: string | null): string | null {
  const trimmed = text?.trim()
  if (!trimmed) return null
  if (trimmed.length <= LAST_ERROR_MAX) return trimmed
  return trimmed.slice(0, LAST_ERROR_MAX)
}

/**
 * Counts for one user. Product rows exclude eval.
 * The window applies to calls, errors, most-used, confirm-blocked, and last error.
 * Last call and stuck runs look at every row.
 */
export function groupUserUsage(
  rows: UserStatSource[],
  periodStart: Date,
  now: Date
): UserUsageStats {
  const startMs = periodStart.getTime()
  const nowMs = now.getTime()
  let calls = 0
  let errors = 0
  let confirmBlocked = 0
  let stuck = 0
  let lastCall: UserUsageStats['lastCall'] = null
  let lastCallMs = -1
  let lastError: string | null = null
  let lastErrorMs = -1
  const features = new Map<string, { count: number; latest: number }>()

  for (const row of rows) {
    const at = atMs(row.createdAt)
    if (at == null) continue
    if (at > lastCallMs) {
      lastCallMs = at
      lastCall = {
        at: row.createdAt,
        feature: row.feature,
        status: row.status,
        eval: row.eval,
      }
    }
    if (
      row.status === 'running' &&
      nowMs - at >= STUCK_RUN_MS
    ) {
      stuck++
    }
    if (row.eval || at < startMs) continue
    calls++
    if (row.confirmBlocked) confirmBlocked++
    const feature = features.get(row.feature) ?? { count: 0, latest: at }
    feature.count++
    if (at > feature.latest) feature.latest = at
    features.set(row.feature, feature)
    if (row.status === 'error') {
      errors++
      if (at >= lastErrorMs) {
        lastErrorMs = at
        lastError = clipError(row.errorSummary)
      }
    }
  }

  let mostUsed: UserUsageStats['mostUsed'] = null
  for (const [feature, stat] of features) {
    if (
      !mostUsed ||
      stat.count > mostUsed.count ||
      (stat.count === mostUsed.count &&
        stat.latest > (features.get(mostUsed.feature)?.latest ?? -1))
    ) {
      mostUsed = { feature, count: stat.count }
    }
  }

  return {
    calls,
    errors,
    mostUsed,
    lastCall,
    lastError,
    confirmBlocked,
    stuck,
  }
}
