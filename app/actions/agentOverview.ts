/**
 * Admin health rollup for the Overview tab. The counts live in summarizeOverview.
 */

'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import {
  OVERVIEW_PAGE_SIZE,
  OVERVIEW_ROW_CAP,
  attachToolCatalog,
  coveredToolIds,
  overviewWindowDays,
  summarizeOverview,
  type AgentOverviewStats,
  type OverviewPreset,
  type OverviewSourceRow,
} from '@/lib/agentObservability/overviewRows'
import { allEvalExpects } from '@/lib/agentEval/loadFixtures'
import { listTools } from '@/lib/aiTools/registry'
import { requireAdmin } from '@/lib/requireAdmin'

const COLUMNS =
  'id, parent_run_id, feature, created_at, status, duration_ms, estimated_cost_usd, total_tokens, tools, meta'

export async function getAgentOverview(
  preset: OverviewPreset = 'month'
): Promise<{ data?: AgentOverviewStats; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  const windowDays = overviewWindowDays(preset)
  const since =
    windowDays == null
      ? null
      : new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    const service = createServiceClient()
    const rows: OverviewSourceRow[] = []
    let from = 0
    let capped = false

    while (rows.length < OVERVIEW_ROW_CAP) {
      const take = Math.min(OVERVIEW_PAGE_SIZE, OVERVIEW_ROW_CAP - rows.length)
      let query = service
        .from('agent_runs')
        .select(COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      if (since) query = query.gte('created_at', since)
      const pageRes = await query.range(from, from + take - 1)
      if (pageRes.error) return { error: pageRes.error.message }

      const page = (pageRes.data || []) as OverviewSourceRow[]
      rows.push(...page)
      if (page.length < take) break

      from += page.length
      if (rows.length < OVERVIEW_ROW_CAP) continue

      let probe = service
        .from('agent_runs')
        .select('id')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
      if (since) probe = probe.gte('created_at', since)
      const probeRes = await probe.range(from, from)
      if (probeRes.error) return { error: probeRes.error.message }
      capped = (probeRes.data || []).length > 0
      break
    }

    const stats = summarizeOverview(rows, { windowDays, capped })
    const catalog = listTools().flatMap((tool) =>
      tool.owner === 'orchestrator' || tool.owner === 'portfolio_analyst'
        ? [
            {
              id: tool.id,
              owner: tool.owner,
              label: tool.name,
              sideEffect: tool.sideEffect,
              requiresConfirmation: tool.requiresConfirmation,
            },
          ]
        : []
    )
    return {
      data: {
        ...stats,
        tools: attachToolCatalog(stats.toolErrorCounts, catalog, coveredToolIds(allEvalExpects())),
      },
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to load overview',
    }
  }
}
