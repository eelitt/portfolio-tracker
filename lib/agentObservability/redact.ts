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
  'sourcetext',
  'email',
  'password',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'cookie',
])

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{12,}/g,
  /xai-[A-Za-z0-9_-]{12,}/g,
  /Bearer\s+[A-Za-z0-9._\-+/=]{12,}/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?=[0-9a-fA-F]*[0-9])(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{40,}\b/g,
]

/** Replace key-shaped tokens. The rest of the text stays. */
export function redactSecrets(text: string): string {
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]')
  }
  return out
}

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
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
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

const MAX_STORED_ARG = 80
const MAX_STORED_ARG_KEYS = 8
const MAX_STORED_STRINGS = 12

/**
 * What agent_runs.tools keeps. Name, ok, a short error, and short scalar args.
 * Result bodies stay in memory for scoring and are not stored.
 */
export function slimToolRecordForStorage(tool: {
  name: string
  args: Record<string, unknown>
  ok: boolean
  error?: string
  latency_ms?: number
  result?: unknown
}): {
  name: string
  args: Record<string, unknown>
  ok: boolean
  error?: string
  latency_ms?: number
} {
  const args: Record<string, unknown> = {}
  let kept = 0
  for (const [key, value] of Object.entries(tool.args)) {
    if (kept >= MAX_STORED_ARG_KEYS) break
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue
    if (typeof value === 'string') {
      if (value.length > MAX_STORED_ARG) continue
      args[key] = redactSecrets(value)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      args[key] = value
    } else if (
      Array.isArray(value) &&
      value.length <= MAX_STORED_STRINGS &&
      value.every((item) => typeof item === 'string' && item.length <= 32)
    ) {
      args[key] = value
    } else {
      continue
    }
    kept += 1
  }
  return {
    name: tool.name,
    args,
    ok: tool.ok,
    ...(tool.error ? { error: tool.error.slice(0, 300) } : {}),
    ...(tool.latency_ms != null ? { latency_ms: tool.latency_ms } : {}),
  }
}
