/**
 * Rolling Portfolio Analyst thread: user/assistant text only, last N messages.
 * Stored in user_ai_insights (feature_type portfolio_analyst_chat). No messages table.
 * Persist/load I/O lives in chatHistoryActions.ts so this file stays testable.
 */

import {
  ANALYST_MAX_FIELD_CHARS,
  ANALYST_MAX_MESSAGES,
} from '@/app/actions/ai/portfolio-analyst/sanitizeMessages'

export const ANALYST_CHAT_FEATURE_TYPE = 'portfolio_analyst_chat'

export type PersistedAnalystMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max)
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part)
      continue
    }
    if (part && typeof part === 'object' && 'text' in part) {
      parts.push(String((part as { text?: unknown }).text ?? ''))
    }
  }
  return parts.join('')
}

function textFromMessage(m: Record<string, unknown>): string {
  const fromContent = textFromContent(m.content)
  if (fromContent.trim()) return fromContent
  if (Array.isArray(m.parts)) {
    const parts: string[] = []
    for (const part of m.parts) {
      if (!part || typeof part !== 'object') continue
      const p = part as { type?: unknown; text?: unknown }
      if (p.type === 'text' && typeof p.text === 'string') parts.push(p.text)
    }
    return parts.join('')
  }
  return fromContent
}

function fallbackId(
  index: number,
  role: string,
  content: string
): string {
  return `anon-${index}-${role}-${content.length}`
}

/**
 * Drop tool/system roles; keep user/assistant text; trim to ANALYST_MAX_MESSAGES (tail).
 */
export function compactAnalystChatMessages(
  raw: unknown[]
): PersistedAnalystMessage[] {
  const out: PersistedAnalystMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const content = truncateStr(textFromMessage(m), ANALYST_MAX_FIELD_CHARS)
    if (!content.trim()) continue
    const id =
      typeof m.id === 'string' && m.id.trim()
        ? m.id
        : fallbackId(out.length, m.role, content)
    out.push({ id, role: m.role, content })
  }
  return out.slice(-ANALYST_MAX_MESSAGES)
}

/**
 * Append incoming by id (update in place if id exists). Tail-trim to max.
 */
export function mergeAnalystChatThreads(
  stored: PersistedAnalystMessage[],
  incoming: PersistedAnalystMessage[]
): PersistedAnalystMessage[] {
  const byId = new Map<string, PersistedAnalystMessage>()
  const order: string[] = []
  const add = (m: PersistedAnalystMessage) => {
    if (byId.has(m.id)) {
      byId.set(m.id, m)
      return
    }
    byId.set(m.id, m)
    order.push(m.id)
  }
  for (const m of stored) add(m)
  for (const m of incoming) add(m)
  return order.map((id) => byId.get(id)!).slice(-ANALYST_MAX_MESSAGES)
}

export function parseStoredAnalystChat(
  result: Record<string, unknown> | undefined
): PersistedAnalystMessage[] {
  if (!result || !Array.isArray(result.messages)) return []
  return compactAnalystChatMessages(result.messages)
}

export function nextAnalystChatMessages(args: {
  stored: PersistedAnalystMessage[]
  requestMessages: unknown[]
  assistantText: string
  assistantId: string
}): PersistedAnalystMessage[] {
  const incoming = compactAnalystChatMessages(args.requestMessages)
  let next = mergeAnalystChatThreads(args.stored, incoming)
  const text = truncateStr(args.assistantText.trim(), ANALYST_MAX_FIELD_CHARS)
  if (!text) return next
  const last = next[next.length - 1]
  if (last?.role === 'assistant' && last.content === text) return next
  return mergeAnalystChatThreads(next, [
    { id: args.assistantId, role: 'assistant', content: text },
  ])
}
