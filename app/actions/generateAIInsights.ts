'use server'

import { getCurrentUser } from './users'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
import {
  getLastAICallTime,
  updateLastAICallTime,
  saveAIInsight,
  getLatestAIInsight,
} from './ai'
import { computePortfolioHash } from '@/lib/calculatePortfolio'
import { aiInsightsSchema } from '@/lib/schemas'

export type AIInsightsResult =
  | { insights: string[]; cachedAt?: string; message?: string; error?: undefined }
  | { error: string; insights?: undefined }

// Helper to support old string results in DB
function normalizeInsights(insights: any): string[] {
  if (Array.isArray(insights)) return insights
  if (typeof insights === 'string') return insights.split('\n').map(s => s.trim()).filter(Boolean)
  return []
}

/**
 * Server Action for generating AI insights.
 * Handles auth, rate limiting (60s per user), and delegates persistence to ai.ts.
 * When rate limit is active, returns the latest cached result (if any) instead of an error.
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

  const summary = buildPortfolioSummary(data)

  try {
    const currentHash = computePortfolioHash(data.transactions)
    const cached = await getLatestAIInsight(user.id, featureType)

    // If portfolio data is identical to last analysis → serve cached (preferred over error)
    if (cached?.result?.portfolioHash === currentHash) {
      return {
        insights: normalizeInsights(cached.result.insights),
        cachedAt: cached.createdAt,
        message: 'Showing previous analysis (portfolio unchanged)',
      }
    }

    // Rate limiting (60s cooldown). If we have a cached result (even if data changed), return it.
    const lastCall = await getLastAICallTime(user.id)
    if (lastCall) {
      const secondsSince = (Date.now() - lastCall.getTime()) / 1000
      if (secondsSince < 60) {
        if (cached) {
          return {
            insights: normalizeInsights(cached.result.insights),
            cachedAt: cached.createdAt,
            message: 'Showing cached result (rate limited)',
          }
        }
        const wait = Math.ceil(60 - secondsSince)
        return { error: `Please wait ${wait} seconds before requesting new insights.` }
      }
    }

    // Dynamic imports so the AI SDK is only loaded server-side when the action is invoked
    const { generateObject } = await import('ai')
    const { xai } = await import('@ai-sdk/xai')

    const { object } = await generateObject({
      model: xai('grok-4.3'),
      schema: aiInsightsSchema,
      system: `You are a professional financial analyst. 
Analyze the user's portfolio and return maximum 6 concise bullet points.
Keep language simple and easy to understand. Avoid jargon.`,
      prompt: `Portfolio data:\n\n${summary}`,
      maxTokens: 500,
    })

    // Persist result (with hash for future change detection) and update cooldown
    const resultToStore: Record<string, any> = {
      insights: object.insights,
      portfolioHash: currentHash,
    }
    await saveAIInsight(user.id, featureType, resultToStore)
    await updateLastAICallTime(user.id)

    return { insights: object.insights }
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
