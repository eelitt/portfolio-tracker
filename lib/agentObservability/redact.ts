/**
 * Privacy-safe truncation for agent_runs.tools payloads.
 * Avoids storing full free-text (notes, sourceText) or unbounded nested JSON.
 */

const MAX_STRING = 500
const MAX_DEPTH = 4
const MAX_ARRAY = 20
const MAX_KEYS = 40

const SENSITIVE_KEYS = new Set([
  'notes',
  'sourceText',
  'email',
  'password',
  'token',
  'authorization',
])

/** Deep-redact / truncate a value before persisting to agent_runs. */
export function redactForStorage(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (depth >= MAX_DEPTH) return '[truncated]'

  if (typeof value === 'string') {
    if (value.length <= MAX_STRING) return value
    return `${value.slice(0, MAX_STRING)}…`
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY).map((v) => redactForStorage(v, depth + 1))
    if (value.length > MAX_ARRAY) {
      slice.push(`[+${value.length - MAX_ARRAY} more]`)
    }
    return slice
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    const entries = Object.entries(value as Record<string, unknown>)
    let i = 0
    for (const [k, v] of entries) {
      if (i >= MAX_KEYS) {
        out._truncated = `+${entries.length - MAX_KEYS} keys`
        break
      }
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = '[redacted]'
      } else {
        out[k] = redactForStorage(v, depth + 1)
      }
      i++
    }
    return out
  }

  return String(value)
}

/** Normalize tool args to a redacted plain object. */
export function asArgsRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return redactForStorage(args) as Record<string, unknown>
  }
  return {}
}

/**
 * Classify a tool execute() return value for logging.
 * Treats `{ error }` and `{ ok: false }` as failures.
 */
export function toolResultOk(result: unknown): { ok: boolean; error?: string } {
  if (result == null) return { ok: true }
  if (typeof result !== 'object') return { ok: true }
  const r = result as Record<string, unknown>
  if (typeof r.error === 'string' && r.error.length > 0) {
    return { ok: false, error: r.error.slice(0, 300) }
  }
  if (r.ok === false) {
    const errors = r.errors
    const msg = Array.isArray(errors)
      ? errors.map(String).join('; ').slice(0, 300)
      : 'ok: false'
    return { ok: false, error: msg || 'ok: false' }
  }
  return { ok: true }
}
