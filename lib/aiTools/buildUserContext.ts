/**
 * Bounded user context pack for orchestrator/analyst (short-term + light long-term).
 * Prefer existing tables: profiles, goals, user_ai_insights.
 * Chat thread is a separate rolling blob (not injected here; the POST already sends messages).
 * No portfolio totals: those come from analyst tools on the turn that needs them.
 */

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserProfile } from '@/lib/user'
import { getLatestAIInsight } from '@/app/actions/ai/storage'
import { HOLDING_NEWS_FEATURE_TYPE } from '@/app/actions/ai/holding-news/newsUtils'
import type { UserContextPack } from './types'
import { formatContributionContext } from '@/lib/allocationTargets'
import { formatUserContextForPrompt } from './formatUserContext'

export { formatUserContextForPrompt }

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
    .select('name, target_amount, is_completed, target_date, planned_monthly')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_GOALS)

  const goals = (goalRows ?? []).map((g) => ({
    name: String(g.name),
    targetAmount: Number(g.target_amount) || 0,
    isCompleted: g.is_completed === true,
    targetDate: typeof g.target_date === 'string' ? g.target_date : null,
    plannedMonthly:
      g.planned_monthly == null ? null : Number(g.planned_monthly) || 0,
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

  const bits: string[] = []
  if (profile?.ageBand) bits.push(profile.ageBand.replace('_', '–'))
  if (profile?.horizon) bits.push(profile.horizon.replace('_', '–'))
  if (profile?.riskTolerance) bits.push(profile.riskTolerance)
  if (profile?.monthlyContribution) {
    bits.push(
      formatContributionContext(profile.monthlyContribution, preferredCurrency)
    )
  }
  const investorOneLiner = bits.length > 0 ? bits.join(', ') : null

  let targetOneLiner: string | null = null
  const { data: policyRows } = await supabase
    .from('allocation_policies')
    .select('id, tolerance_pp')
    .eq('user_id', userId)
    .maybeSingle()
  if (policyRows) {
    const { data: trows } = await supabase
      .from('allocation_targets')
      .select('scope, key, weight_percent')
      .eq('policy_id', policyRows.id)
      .eq('scope', 'asset_type')
    if (trows && trows.length > 0) {
      const parts = trows
        .map((r) => `${r.key} ${Number(r.weight_percent)}`)
        .join(' / ')
      targetOneLiner = `Target: ${parts}`
    }
  }

  return {
    preferredCurrency,
    isAdmin,
    goals,
    lastAnalysis,
    lastNews,
    investorOneLiner,
    targetOneLiner,
  }
}
