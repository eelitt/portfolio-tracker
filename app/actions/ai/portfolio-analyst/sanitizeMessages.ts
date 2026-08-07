/**
 * Sanitize client-supplied chat history for Portfolio Analyst.
 * Pure helpers — unit tested; used by the API route only.
 *
 * Goals:
 * - Drop client "system" / unknown roles (server owns the real system prompt)
 * - Cap history length and string size (token / cost bomb)
 * - Keep user | assistant | tool shapes that useChat needs for multi-step history
 */

/** Max messages kept (tail). */
export const ANALYST_MAX_MESSAGES = 20
/** Max characters for a single text field (content or part.text). */
export const ANALYST_MAX_FIELD_CHARS = 4_000
/** Max characters for the latest user message (reject request if over). */
export const ANALYST_MAX_LAST_USER_CHARS = 4_000
/** Soft cap on total text chars across kept messages (truncate older first via tail slice). */
export const ANALYST_MAX_TOTAL_CHARS = 40_000

const ALLOWED_ROLES = new Set(['user', 'assistant', 'tool'])

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max)
}

function textLenFromContent(content: unknown): number {
  if (typeof content === 'string') return content.length
  if (!Array.isArray(content)) return 0
  let n = 0
  for (const part of content) {
    if (typeof part === 'string') n += part.length
    else if (part && typeof part === 'object' && 'text' in part) {
      n += String((part as { text?: unknown }).text ?? '').length
    }
  }
  return n
}

function sanitizeContent(content: unknown): unknown {
  if (typeof content === 'string') {
    return truncateStr(content, ANALYST_MAX_FIELD_CHARS)
  }
  if (!Array.isArray(content)) {
    return content == null ? '' : truncateStr(String(content), ANALYST_MAX_FIELD_CHARS)
  }
  return content.map((part) => {
    if (typeof part === 'string') {
      return truncateStr(part, ANALYST_MAX_FIELD_CHARS)
    }
    if (part && typeof part === 'object') {
      const p = part as Record<string, unknown>
      if (typeof p.text === 'string') {
        return { ...p, text: truncateStr(p.text, ANALYST_MAX_FIELD_CHARS) }
      }
    }
    return part
  })
}

/**
 * Extract plain text from the last user message (for confirm gate + size check).
 */
export function extractLastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown } | null
    if (!m || m.role !== 'user') continue
    const c = m.content
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          if (typeof part === 'string') return part
          if (part && typeof part === 'object' && 'text' in part) {
            return String((part as { text?: unknown }).text ?? '')
          }
          return ''
        })
        .join('')
    }
    return String(c ?? '')
  }
  return ''
}

export type SanitizeAnalystMessagesResult =
  | { ok: true; messages: unknown[]; lastUserText: string }
  | { ok: false; error: string; status: 400 }

/**
 * Filter/truncate client messages before convertToCoreMessages + streamText.
 */
export function sanitizeAnalystMessages(raw: unknown[]): SanitizeAnalystMessagesResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'No messages provided.', status: 400 }
  }

  // Role filter only first (no truncate yet — need raw last-user length check).
  const roleFiltered: unknown[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const role = (item as { role?: unknown }).role
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
      // Drop system / developer / data / garbage — server sets system prompt.
      continue
    }
    roleFiltered.push(item)
  }

  if (roleFiltered.length === 0) {
    return {
      ok: false,
      error: 'No valid user/assistant messages provided.',
      status: 400,
    }
  }

  const lastUserTextRaw = extractLastUserText(roleFiltered)
  if (!lastUserTextRaw.trim()) {
    return {
      ok: false,
      error: 'Last message must include user text.',
      status: 400,
    }
  }
  if (lastUserTextRaw.length > ANALYST_MAX_LAST_USER_CHARS) {
    return {
      ok: false,
      error: `Message too long (max ${ANALYST_MAX_LAST_USER_CHARS} characters).`,
      status: 400,
    }
  }

  type SanitizedMessage = Record<string, unknown> & {
    role: string
    content: unknown
  }

  const truncated: SanitizedMessage[] = roleFiltered.map((item) => {
    const msg = item as Record<string, unknown>
    return {
      ...msg,
      role: String(msg.role),
      content: sanitizeContent(msg.content),
    }
  })

  // Keep tail first for recency, then enforce total char budget from the end.
  let kept: SanitizedMessage[] = truncated.slice(-ANALYST_MAX_MESSAGES)
  let total = 0
  const budgeted: SanitizedMessage[] = []
  for (let i = kept.length - 1; i >= 0; i--) {
    const len = textLenFromContent(kept[i].content)
    if (total + len > ANALYST_MAX_TOTAL_CHARS && budgeted.length > 0) {
      break
    }
    total += len
    budgeted.unshift(kept[i])
  }
  kept = budgeted

  // Prefer original last-user text for confirm gate (not truncated mid-sentence)
  const lastUserText = extractLastUserText(kept) || lastUserTextRaw

  return { ok: true, messages: kept, lastUserText }
}
