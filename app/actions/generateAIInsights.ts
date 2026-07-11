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
import { getCurrentUserProfile } from './users'
import { formatCurrency } from '@/lib/currency'

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

  const summary = await buildPortfolioSummary(data)

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
      temperature: 0.2,
      system: 
      `You are a professional portfolio analyst. 
Analyze the user's portfolio and provide maximum 6 concise, actionable bullet points.

Focus on:
- Portfolio risks and weaknesses
- Concentration and diversification issues
- Potential improvements or considerations

Rules:
- Be direct and practical. 
- Avoid generic statements like "you should diversify".
- Only give advice that is relevant to the actual portfolio data.
- Use simple language. No jargon.
- Prioritize the most important observations first.`,
      prompt:
      `Portfolio summary:
${summary}

Analyze the portfolio and give maximum 6 bullet points with actionable insights. 
Focus on risks, concentration, and potential improvements.`,
      maxTokens: 250,
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

async function buildPortfolioSummary(data: PortfolioData): Promise<string> {
  const profile = await getCurrentUserProfile()
  const currency = profile?.preferredCurrency || 'USD'

  const {
    totalMarketValue,
    total24hChange,
    total24hChangePercent,
    enrichedHoldings,
  } = data

  const fmt = (amount: number) => formatCurrency(amount, currency, 0)

  let summary = `Total Value: ${fmt(totalMarketValue)}\n`
  summary += `24h Change: ${fmt(total24hChange)} (${total24hChangePercent.toFixed(1)}%)\n`
  summary += `Holdings: ${enrichedHoldings.length}\n`

  if (enrichedHoldings.length === 0) {
    return summary
  }

  summary += 'Holdings:\n'

  // Sort holdings by value (highest first)
  const sorted = [...enrichedHoldings].sort((a, b) => b.marketValue - a.marketValue)

  // Show top 6 holdings
  for (const holding of sorted.slice(0, 6)) {
    const percentage =
      totalMarketValue > 0
        ? ((holding.marketValue / totalMarketValue) * 100).toFixed(1)
        : '0'

    summary += `- ${holding.symbol}: ${fmt(holding.marketValue)} (${percentage}%), `
    summary += `PnL: ${holding.unrealizedPnlPercent.toFixed(0)}%\n`
  }

  // Show remaining holdings summary
  if (sorted.length > 6) {
    const remainingValue = sorted
      .slice(6)
      .reduce((sum, holding) => sum + holding.marketValue, 0)

    summary += `- +${sorted.length - 6} others: ${fmt(remainingValue)}\n`
  }

  return summary
}
