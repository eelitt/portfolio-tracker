/**
 * NDJSON events from POST /api/admin/agent-eval.
 * start and case are emitted as each fixture finishes. done or error closes the stream.
 */

export type EvalProgressEvent =
  | { type: 'start'; total: number }
  | { type: 'case'; index: number; total: number; caseId: string; passed: boolean }
  | { type: 'done'; passed: number; failed: number; total: number; durationMs: number }
  | { type: 'error'; error: string }

export type EvalSuiteProgress = Extract<EvalProgressEvent, { type: 'start' | 'case' }>

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** One stream line. Blank or malformed lines are ignored. */
export function parseEvalProgressLine(line: string): EvalProgressEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let body: unknown
  try {
    body = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object') return null

  const rec = body as Record<string, unknown>
  if (rec.type === 'start') {
    const total = finiteNumber(rec.total)
    if (total == null) return null
    return { type: 'start', total }
  }
  if (rec.type === 'case') {
    const index = finiteNumber(rec.index)
    const total = finiteNumber(rec.total)
    if (
      index == null ||
      total == null ||
      typeof rec.caseId !== 'string' ||
      typeof rec.passed !== 'boolean'
    ) {
      return null
    }
    return { type: 'case', index, total, caseId: rec.caseId, passed: rec.passed }
  }
  if (rec.type === 'done') {
    const passed = finiteNumber(rec.passed)
    const failed = finiteNumber(rec.failed)
    const total = finiteNumber(rec.total)
    const durationMs = finiteNumber(rec.durationMs)
    if (passed == null || failed == null || total == null || durationMs == null) {
      return null
    }
    return { type: 'done', passed, failed, total, durationMs }
  }
  if (rec.type === 'error') {
    if (typeof rec.error !== 'string') return null
    return { type: 'error', error: rec.error }
  }
  return null
}
