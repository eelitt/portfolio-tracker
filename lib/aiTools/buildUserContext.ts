/**
 * Bounded user context pack for orchestrator/analyst (short-term + light long-term).
 * Prefer existing tables: profiles, goals, user_ai_insights — no chat history DB.
 */

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/user'
import { getPortfolioData } from '@/lib/portfolioData'
import { getLatestAIInsight } from '@/app/actions/ai/storage'
import { HOLDING_NEWS_FEATURE_TYPE } from '@/app/actions/ai/holding-news/newsUtils'
import type { UserContextPack } from './types'

const MAX_GOALS = 5
const MAX_ANALYSIS_BULLETS = 6

function normalizeInsights(insights: unknown): string[] {
  if (Array.isArray(insights)) return insights.map(String).filter(Boolean)
  if (typeof insights === 'string') {
    return insights
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Build a compact context pack for the authenticated session user.
 * userId must match the session (getLatestAIInsight enforces that).
 */
export async function buildUserContext(
  userId: string
): Promise<UserContextPack> {
  const profile = await getCurrentUserProfile()
  const preferredCurrency = profile?.preferredCurrency ?? 'USD'
  const isAdmin = profile?.admin === true

  const supabase = await createClient()
  const { data: goalRows } = await supabase
    .from('goals')
    .select('name, target_amount, is_completed')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_GOALS)

  const goals = (goalRows ?? []).map((g) => ({
    name: String(g.name),
    targetAmount: Number(g.target_amount) || 0,
    isCompleted: g.is_completed === true,
  }))

  const analysisRow = await getLatestAIInsight(userId, 'portfolio_insights')
  let lastAnalysis: UserContextPack['lastAnalysis'] = null
  if (analysisRow) {
    const bullets = normalizeInsights(analysisRow.result.insights).slice(
      0,
      MAX_ANALYSIS_BULLETS
    )
    if (bullets.length > 0) {
      lastAnalysis = {
        bullets,
        asOf: analysisRow.createdAt,
      }
    }
  }

  const newsRow = await getLatestAIInsight(userId, HOLDING_NEWS_FEATURE_TYPE)
  let lastNews: UserContextPack['lastNews'] = null
  if (newsRow) {
    const news = newsRow.result.news
    let symbolCount = 0
    if (news && typeof news === 'object' && !Array.isArray(news)) {
      symbolCount = Object.keys(news as object).length
    }
    const asOf =
      (typeof newsRow.result.contentFetchedAt === 'string' &&
        newsRow.result.contentFetchedAt) ||
      (typeof newsRow.result.lastCheckedAt === 'string' &&
        newsRow.result.lastCheckedAt) ||
      newsRow.createdAt
    lastNews = { asOf, symbolCount }
  }

  let portfolioOneLiner: string | null = null
  try {
    const data = await getPortfolioData()
    if (!data.error && data.totalMarketValue > 0) {
      const top = [...data.enrichedHoldings]
        .filter((h) => h.asset_type !== 'cash' && (h.marketValue ?? 0) > 0)
        .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
        .slice(0, 3)
        .map((h) => h.symbol)
      const topStr = top.length ? `; top: ${top.join(', ')}` : ''
      portfolioOneLiner = `~${Math.round(data.totalMarketValue)} ${data.preferredCurrency} MV across ${data.holdingsCount} holdings${topStr}`
    }
  } catch {
    portfolioOneLiner = null
  }

  return {
    preferredCurrency,
    isAdmin,
    goals,
    lastAnalysis,
    lastNews,
    portfolioOneLiner,
  }
}

/** Compact markdown block for system prompt injection (token-bounded). */
export function formatUserContextForPrompt(pack: UserContextPack): string {
  const lines: string[] = [
    '## User context (trusted server pack — do not invent beyond this + tools)',
    `- Preferred currency: **${pack.preferredCurrency}**`,
  ]

  if (pack.portfolioOneLiner) {
    lines.push(`- Portfolio snapshot: ${pack.portfolioOneLiner}`)
  }

  if (pack.goals.length > 0) {
    lines.push('- Goals:')
    for (const g of pack.goals) {
      const done = g.isCompleted ? 'done' : 'open'
      lines.push(`  • ${g.name} (target ${g.targetAmount}, ${done})`)
    }
  } else {
    lines.push('- Goals: none set')
  }

  if (pack.lastAnalysis) {
    lines.push(
      `- Last portfolio analysis (${pack.lastAnalysis.asOf ?? 'unknown time'}):`
    )
    for (const b of pack.lastAnalysis.bullets) {
      lines.push(`  • ${b}`)
    }
  } else {
    lines.push('- Last portfolio analysis: none stored yet')
  }

  if (pack.lastNews) {
    lines.push(
      `- Last holding-news package: ${pack.lastNews.symbolCount} symbol(s), as of ${pack.lastNews.asOf ?? 'unknown'}`
    )
  } else {
    lines.push('- Last holding-news package: none stored yet')
  }

  lines.push(
    '- Writes: only via prepare → user confirm → confirm_transaction (never invent trades).'
  )

  return lines.join('\n')
}
