'use server'

/**
 * Portfolio Analysis server action — AI Insights sidebar “Portfolio Analysis”.
 *
 * Flow:
 *  1. Auth + non-empty portfolio + XAI_API_KEY
 *  2. Load cached user_ai_insights (feature_type portfolio_insights)
 *  3. If stored portfolioHash matches current transactions → return cache (no LLM)
 *  4. Else enforce global 60s AI cooldown (profiles.last_ai_call_at)
 *  5. Build a compact text summary → generateObject (≤6 insight bullets)
 *  6. Upsert { insights, portfolioHash } and bump last_ai_call_at
 *
 * Unlike Holding News: no live search, no 24h gate — regeneration is driven by
 * portfolio content change (hash) + shared 60s rate limit across AI features.
 */

import { getCurrentUser, getCurrentUserProfile, isCurrentUserAdmin } from '@/app/actions/users'
import { getPortfolioData, type PortfolioData } from '@/lib/portfolioData'
import {
  getLastAICallTime,
  updateLastAICallTime,
  saveAIInsight,
  getLatestAIInsight,
} from '@/app/actions/ai/storage'
import { computePortfolioHash } from '@/lib/calculatePortfolio'
import { aiInsightsSchema } from '@/lib/schemas'
import { formatCurrency } from '@/lib/currency'

/** user_ai_insights.feature_type for this feature (one row per user). */
const FEATURE_TYPE = 'portfolio_insights'

/** Success vs error shape consumed by usePortfolioAnalysis. */
export type PortfolioInsightsResult =
  | { insights: string[]; cachedAt?: string; message?: string; error?: undefined }
  | { error: string; insights?: undefined }

/**
 * Normalize insights from DB or older stored formats.
 * Prefer string[]; also accept a single newline-separated string from legacy rows.
 */
function normalizeInsights(insights: unknown): string[] {
  if (Array.isArray(insights)) return insights.map(String)
  if (typeof insights === 'string') {
    return insights
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Generate (or return cached) portfolio analysis for the current user.
 * Hash short-circuit when transactions unchanged; 60s global AI cooldown otherwise.
 */
export async function generatePortfolioInsights(): Promise<PortfolioInsightsResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const data = await getPortfolioData()
  if (data.error || data.totalMarketValue === 0) {
    return { error: 'No portfolio data available to analyze.' }
  }

  if (!process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured.' }
  }

  try {
    const cached = await getLatestAIInsight(user.id, FEATURE_TYPE)
    // Hash of transactions: same holdings activity → same analysis, skip LLM cost
    const currentHash = computePortfolioHash(data.transactions)

    if (cached?.result?.portfolioHash === currentHash) {
      return {
        insights: normalizeInsights(cached.result.insights),
        cachedAt: cached.createdAt,
        message: 'Showing previous analysis (portfolio unchanged)',
      }
    }

    // Shared with CSV import / other AI that update last_ai_call_at (admins skip)
    if (!(await isCurrentUserAdmin())) {
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
    }

    // Dynamic import: AI SDK only loads when a real generation runs
    const { generateObject } = await import('ai')
    const { xai } = await import('@ai-sdk/xai')

    const summary = await buildPortfolioSummary(data)

    const { object } = await generateObject({
      model: xai('grok-4.3'),
      schema: aiInsightsSchema,
      temperature: 0.2,
      system: `You are a professional portfolio analyst. 
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
      prompt: `Portfolio summary:
${summary}

Analyze the portfolio and give maximum 6 bullet points with actionable insights. 
Focus on risks, concentration, and potential improvements.`,
      maxTokens: 250,
    })

    await saveAIInsight(user.id, FEATURE_TYPE, {
      insights: object.insights,
      portfolioHash: currentHash,
    })
    await updateLastAICallTime(user.id)

    return { insights: object.insights }
  } catch (e) {
    console.error('Portfolio insights error', e)
    return { error: 'Failed to generate insights. Please try again later.' }
  }
}

/**
 * Compact text summary for the LLM (keeps tokens low).
 * Totals + top 6 holdings by market value; remainder rolled into “+N others”.
 * Amounts use the user’s preferred currency for display consistency.
 */
async function buildPortfolioSummary(data: PortfolioData): Promise<string> {
  const profile = await getCurrentUserProfile()
  const currency = profile?.preferredCurrency || 'USD'

  const {
    totalMarketValue,
    total24hChange,
    total24hChangePercent,
    enrichedHoldings,
  } = data

  // Amounts from getPortfolioData are already in preferred currency — pass rate 1
  // so EUR display is not multiplied by 0 (or double-converted).
  const fmt = (amount: number) => formatCurrency(amount, currency, 1)

  let summary = `Total Value: ${fmt(totalMarketValue)}\n`
  summary += `24h Change: ${fmt(total24hChange)} (${total24hChangePercent.toFixed(1)}%)\n`
  summary += `Holdings: ${enrichedHoldings.length}\n`

  if (enrichedHoldings.length === 0) {
    return summary
  }

  summary += 'Holdings:\n'

  const sorted = [...enrichedHoldings].sort((a, b) => b.marketValue - a.marketValue)

  for (const holding of sorted.slice(0, 6)) {
    const percentage =
      totalMarketValue > 0
        ? ((holding.marketValue / totalMarketValue) * 100).toFixed(1)
        : '0'

    summary += `- ${holding.symbol}: ${fmt(holding.marketValue)} (${percentage}%), `
    summary += `PnL: ${holding.unrealizedPnlPercent.toFixed(0)}%\n`
  }

  if (sorted.length > 6) {
    const remainingValue = sorted
      .slice(6)
      .reduce((sum, holding) => sum + holding.marketValue, 0)

    summary += `- +${sorted.length - 6} others: ${fmt(remainingValue)}\n`
  }

  return summary
}
