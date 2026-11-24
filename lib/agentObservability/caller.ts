/**
 * Admin display helpers for agent_runs. Email is not stored on the row.
 */

/** Cap for meta.subject. Keeps the log line short. */
export const LOG_SUBJECT_MAX = 200

/** Auth email when present. Otherwise the user id. */
export function callerLabel(
  email: string | null | undefined,
  userId: string
): string {
  const trimmed = email?.trim()
  if (trimmed) return trimmed
  return userId
}

/**
 * One short subject for a model row that has no user question.
 * Empty input stores nothing.
 */
export function logSubject(text: string | null | undefined): string | undefined {
  const trimmed = text?.trim().replace(/\s+/g, ' ')
  if (!trimmed) return undefined
  if (trimmed.length <= LOG_SUBJECT_MAX) return trimmed
  return trimmed.slice(0, LOG_SUBJECT_MAX)
}

/** Symbols covered by one news model call. */
export function newsLogSubject(symbols: string[]): string | undefined {
  return logSubject(symbols.map((s) => s.trim()).filter(Boolean).join(', '))
}
