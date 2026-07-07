'use server'

import { getCurrentUser } from './users'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
import {
  getLastAICallTime,
  updateLastAICallTime,
  saveAIInsight,
} from './ai'

export type AIInsightsResult =
  | { insights: string; error?: undefined }
  | { error: string; insights?: undefined }

/**
 * Server Action for generating AI insights.
 * Handles auth, rate limiting (60s per user), and delegates persistence to ai.ts.
 */
export async function generateAIInsights(
  featureType: string = 'portfolio_insights'
): Promise<AIInsightsResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (featureType !== 'portfolio_insights') {
    return { error: 'This AI feature is not implemented yet.' }
  }

  const data = await getPortfolioData()
  if (data.error || data.totalMarketValue === 0) {
    return { error: 'No portfolio data available to analyze.' }
  }

  if (!process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured.' }
  }

  // Rate limiting: 60s cooldown per user
  const lastCall = await getLastAICallTime(user.id)
  if (lastCall) {
    const secondsSince = (Date.now() - lastCall.getTime()) / 1000
    if (secondsSince < 60) {
      const wait = Math.ceil(60 - secondsSince)
      return { error: `Please wait ${wait} more second${wait > 1 ? 's' : ''} before requesting another AI insight.` }
    }
  }

  const summary = buildPortfolioSummary(data)

  try {
    // Dynamic imports so the AI SDK is only loaded server-side when the action is invoked
    const { generateText } = await import('ai')
    const { xai } = await import('@ai-sdk/xai')

    const { text } = await generateText({
      model: xai('grok-4.3'),
      system: `You are a professional, neutral financial analyst. 
Provide a concise (4-7 sentence) objective review of the portfolio.
Cover: overall size and performance, concentration/diversification, stock vs crypto mix, notable positions.
Be factual and cautious. Do not recommend buying or selling any specific asset.
Do not give personalized financial advice.`,
      prompt: `Here is the user's current portfolio data:\n\n${summary}\n\nProvide your brief analysis now.`,
      maxTokens: 600,
    })

    // Persist result and update cooldown (delegated to ai.ts)
    await saveAIInsight(user.id, featureType, { insights: text })
    await updateLastAICallTime(user.id)

    return { insights: text }
  } catch (e) {
    console.error('AI insights error', e)
    return { error: 'Failed to generate insights. Please try again later.' }
  }
}

function buildPortfolioSummary(data: PortfolioData): string {
  const {
    totalMarketValue,
    total24hChange,
    total24hChangePercent,
    enrichedHoldings,
  } = data

  let s = `Total Market Value: $${totalMarketValue.toFixed(2)}\n`
  s += `24h Change: $${total24hChange.toFixed(2)} (${total24hChangePercent.toFixed(2)}%)\n`
  s += `Number of holdings: ${enrichedHoldings.length}\n`

  if (enrichedHoldings.length === 0) return s

  s += 'Holdings:\n'

  const sorted = [...enrichedHoldings].sort(
    (a, b) => b.marketValue - a.marketValue
  )
  const top = sorted.slice(0, 8)

  for (const h of top) {
    const pct =
      totalMarketValue > 0
        ? ((h.marketValue / totalMarketValue) * 100).toFixed(1)
        : '0'
    s += `- ${h.symbol} (${h.asset_type}): $${h.marketValue.toFixed(0)} (${pct}%), `
    s += `PnL: $${h.unrealizedPnl.toFixed(0)} (${h.unrealizedPnlPercent.toFixed(1)}%)\n`
  }

  if (sorted.length > 8) {
    const restValue = sorted
      .slice(8)
      .reduce((sum, h) => sum + h.marketValue, 0)
    s += `- and ${sorted.length - 8} others: $${restValue.toFixed(0)}\n`
  }

  return s
}
