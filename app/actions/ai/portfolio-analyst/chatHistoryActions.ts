'use server'

import { getCurrentUser } from '@/lib/user'
import {
  getLatestAIInsight,
  saveAIInsight,
} from '@/app/actions/ai/storage'
import {
  ANALYST_CHAT_FEATURE_TYPE,
  nextAnalystChatMessages,
  parseStoredAnalystChat,
  type PersistedAnalystMessage,
} from '@/app/actions/ai/portfolio-analyst/chatHistory'

export async function getAnalystChatHistory(): Promise<{
  data: PersistedAnalystMessage[]
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user) return { data: [], error: 'Not authenticated' }

  const row = await getLatestAIInsight(user.id, ANALYST_CHAT_FEATURE_TYPE)
  return { data: parseStoredAnalystChat(row?.result) }
}

export async function clearAnalystChatHistory(): Promise<{
  data?: true
  error?: string
}> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not authenticated' }

  await saveAIInsight(user.id, ANALYST_CHAT_FEATURE_TYPE, {
    messages: [],
    updatedAt: new Date().toISOString(),
  })
  return { data: true }
}

export async function persistAnalystChatTurn(args: {
  userId: string
  requestMessages: unknown[]
  assistantText: string
}): Promise<void> {
  const row = await getLatestAIInsight(args.userId, ANALYST_CHAT_FEATURE_TYPE)
  const next = nextAnalystChatMessages({
    stored: parseStoredAnalystChat(row?.result),
    requestMessages: args.requestMessages,
    assistantText: args.assistantText,
    assistantId: crypto.randomUUID(),
  })
  await saveAIInsight(args.userId, ANALYST_CHAT_FEATURE_TYPE, {
    messages: next,
    updatedAt: new Date().toISOString(),
  })
}
