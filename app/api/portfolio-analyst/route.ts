/**
 * Portfolio Analyst streaming chat endpoint.
 *
 * POST { messages } → data stream for useChat.
 * Auth + analyst rate limit + tool-first streamText (xAI).
 */

import { streamText, convertToCoreMessages } from 'ai'
import { xai } from '@ai-sdk/xai'
import { createClient } from '@/lib/supabase/server'
import { PORTFOLIO_ANALYST_SYSTEM_PROMPT } from '@/app/actions/ai/portfolio-analyst/prompt'
import { createPortfolioAnalystTools } from '@/app/actions/ai/portfolio-analyst/tools'
import { checkAndConsumeAnalystRateLimit } from '@/app/actions/ai/portfolio-analyst/rateLimit'

/** Cap conversation history sent to the model (token control). */
const MAX_MESSAGES = 20

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Not authenticated', { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('access_to_app')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.access_to_app !== true) {
      return new Response('Access denied', { status: 403 })
    }

    if (!process.env.XAI_API_KEY) {
      return new Response('AI service is not configured.', { status: 503 })
    }

    const body = await req.json()
    const rawMessages = Array.isArray(body?.messages) ? body.messages : []
    if (rawMessages.length === 0) {
      return new Response('No messages provided.', { status: 400 })
    }

    const rate = await checkAndConsumeAnalystRateLimit(user.id)
    if (!rate.allowed) {
      return new Response(rate.error, { status: 429 })
    }

    const messages = rawMessages.slice(-MAX_MESSAGES)

    const result = streamText({
      model: xai('grok-4.3'),
      system: PORTFOLIO_ANALYST_SYSTEM_PROMPT,
      messages: convertToCoreMessages(messages),
      tools: createPortfolioAnalystTools(user.id),
      maxSteps: 5,
      temperature: 0.2,
      onError: ({ error }) => {
        console.error('Portfolio analyst stream error:', error)
      },
    })

    return result.toDataStreamResponse()
  } catch (e) {
    console.error('Portfolio analyst route error:', e)
    return new Response('Failed to run portfolio analyst. Please try again.', {
      status: 500,
    })
  }
}
