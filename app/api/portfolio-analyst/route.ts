/**
 * Portfolio Analyst streaming chat endpoint.
 *
 * POST { messages } → data stream for useChat.
 * Auth + analyst rate limit + sanitized history + tool-first streamText (xAI).
 */

import { streamText, convertToCoreMessages } from 'ai'
import { xai } from '@ai-sdk/xai'
import { createClient } from '@/lib/supabase/server'
import { PORTFOLIO_ANALYST_SYSTEM_PROMPT } from '@/app/actions/ai/portfolio-analyst/prompt'
import { createPortfolioAnalystTools } from '@/app/actions/ai/portfolio-analyst/tools'
import { checkAndConsumeAnalystRateLimit } from '@/app/actions/ai/portfolio-analyst/rateLimit'
import { sanitizeAnalystMessages } from '@/app/actions/ai/portfolio-analyst/sanitizeMessages'

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

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return new Response('Invalid JSON body.', { status: 400 })
    }

    const rawMessages = Array.isArray((body as { messages?: unknown })?.messages)
      ? ((body as { messages: unknown[] }).messages)
      : []

    const sanitized = sanitizeAnalystMessages(rawMessages)
    if (!sanitized.ok) {
      return new Response(sanitized.error, { status: sanitized.status })
    }

    const rate = await checkAndConsumeAnalystRateLimit(user.id)
    if (!rate.allowed) {
      return new Response(rate.error, { status: 429 })
    }

    const result = streamText({
      model: xai('grok-4.3'),
      system: PORTFOLIO_ANALYST_SYSTEM_PROMPT,
      messages: convertToCoreMessages(sanitized.messages as Parameters<
        typeof convertToCoreMessages
      >[0]),
      tools: createPortfolioAnalystTools(user.id, {
        lastUserText: sanitized.lastUserText,
      }),
      maxSteps: 5,
      temperature: 0.2,
      onError: ({ error }) => {
        // Avoid logging full message bodies / PII
        const name = error instanceof Error ? error.name : 'Error'
        const msg = error instanceof Error ? error.message : 'unknown'
        console.error('Portfolio analyst stream error:', name, msg)
      },
    })

    return result.toDataStreamResponse()
  } catch (e) {
    const name = e instanceof Error ? e.name : 'Error'
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('Portfolio analyst route error:', name, msg)
    return new Response('Failed to run portfolio analyst. Please try again.', {
      status: 500,
    })
  }
}
