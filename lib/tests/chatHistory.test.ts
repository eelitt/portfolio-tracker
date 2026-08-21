import { describe, it, expect } from 'vitest'
import {
  compactAnalystChatMessages,
  mergeAnalystChatThreads,
  nextAnalystChatMessages,
  parseStoredAnalystChat,
} from '@/app/actions/ai/portfolio-analyst/chatHistory'
import {
  ANALYST_MAX_FIELD_CHARS,
  ANALYST_MAX_MESSAGES,
} from '@/app/actions/ai/portfolio-analyst/sanitizeMessages'

describe('compactAnalystChatMessages', () => {
  it('drops tool and system roles, keeps user/assistant text', () => {
    const out = compactAnalystChatMessages([
      { id: 's', role: 'system', content: 'ignore' },
      { id: 'u1', role: 'user', content: 'What is my BTC allocation?' },
      { id: 'a1', role: 'assistant', content: '' },
      { id: 't', role: 'tool', content: JSON.stringify({ total: 1 }) },
      { id: 'a2', role: 'assistant', content: 'About 40%.' },
    ])
    expect(out).toEqual([
      { id: 'u1', role: 'user', content: 'What is my BTC allocation?' },
      { id: 'a2', role: 'assistant', content: 'About 40%.' },
    ])
  })

  it('reads text parts when content is empty', () => {
    const out = compactAnalystChatMessages([
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        parts: [
          { type: 'text', text: 'Hello' },
          { type: 'tool-invocation', toolInvocation: { toolName: 'x' } },
        ],
      },
    ])
    expect(out).toEqual([{ id: 'a1', role: 'assistant', content: 'Hello' }])
  })

  it('trims to the last ANALYST_MAX_MESSAGES user/assistant bubbles', () => {
    const raw = Array.from({ length: ANALYST_MAX_MESSAGES + 8 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg ${i}`,
    }))
    const out = compactAnalystChatMessages(raw)
    expect(out).toHaveLength(ANALYST_MAX_MESSAGES)
    expect(out[0]?.id).toBe('m8')
    expect(out[out.length - 1]?.id).toBe(`m${ANALYST_MAX_MESSAGES + 7}`)
  })

  it('truncates oversized content fields', () => {
    const out = compactAnalystChatMessages([
      {
        id: 'u',
        role: 'user',
        content: 'x'.repeat(ANALYST_MAX_FIELD_CHARS + 50),
      },
    ])
    expect(out[0]?.content.length).toBe(ANALYST_MAX_FIELD_CHARS)
  })
})

describe('mergeAnalystChatThreads', () => {
  it('keeps stored tail when incoming is a truncated continuation', () => {
    const stored = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg ${i}`,
    }))
    const incoming = [
      stored[8],
      stored[9],
      { id: 'm10', role: 'user' as const, content: 'follow up' },
    ]
    const merged = mergeAnalystChatThreads(stored, incoming)
    expect(merged.map((m) => m.id)).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      'm8',
      'm9',
      'm10',
    ])
  })

  it('trims merged threads to ANALYST_MAX_MESSAGES', () => {
    const stored = Array.from({ length: ANALYST_MAX_MESSAGES }, (_, i) => ({
      id: `s${i}`,
      role: 'user' as const,
      content: `old ${i}`,
    }))
    const incoming = [{ id: 'n1', role: 'user' as const, content: 'new' }]
    const merged = mergeAnalystChatThreads(stored, incoming)
    expect(merged).toHaveLength(ANALYST_MAX_MESSAGES)
    expect(merged[0]?.id).toBe('s1')
    expect(merged[merged.length - 1]?.id).toBe('n1')
  })
})

describe('parseStoredAnalystChat', () => {
  it('returns [] for missing or invalid payloads', () => {
    expect(parseStoredAnalystChat(undefined)).toEqual([])
    expect(parseStoredAnalystChat({})).toEqual([])
    expect(parseStoredAnalystChat({ messages: 'nope' })).toEqual([])
  })

  it('treats empty messages as a cleared thread', () => {
    expect(parseStoredAnalystChat({ messages: [] })).toEqual([])
  })

  it('compacts a stored blob', () => {
    const parsed = parseStoredAnalystChat({
      messages: [
        { id: 't', role: 'tool', content: '{}' },
        { id: 'u', role: 'user', content: 'hi' },
      ],
    })
    expect(parsed).toEqual([{ id: 'u', role: 'user', content: 'hi' }])
  })
})

describe('nextAnalystChatMessages', () => {
  it('appends assistant text onto stored + request user', () => {
    const next = nextAnalystChatMessages({
      stored: [{ id: 'u1', role: 'user', content: 'first' }],
      requestMessages: [
        { id: 'u1', role: 'user', content: 'first' },
        { id: 'u2', role: 'user', content: 'second' },
      ],
      assistantText: '  answer  ',
      assistantId: 'a2',
    })
    expect(next.map((m) => m.id)).toEqual(['u1', 'u2', 'a2'])
    expect(next[2]?.content).toBe('answer')
  })

  it('does not duplicate an identical trailing assistant', () => {
    const next = nextAnalystChatMessages({
      stored: [
        { id: 'u1', role: 'user', content: 'hi' },
        { id: 'a1', role: 'assistant', content: 'hello' },
      ],
      requestMessages: [{ id: 'u1', role: 'user', content: 'hi' }],
      assistantText: 'hello',
      assistantId: 'a-new',
    })
    expect(next.map((m) => m.id)).toEqual(['u1', 'a1'])
  })
})
