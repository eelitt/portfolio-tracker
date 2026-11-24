/**
 * Admin health rollup for the Overview tab. The counts live in summarizeOverview.
 */

'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import {
  pickOverviewRows,
  summarizeOverview,
  type AgentOverviewStats,
  type OverviewSourceRow,
} from '@/lib/agentObservability/overviewRows'
import { requireAdmin } from '@/lib/requireAdmin'

export async function getAgentOverview(
  windowDays = 30
): Promise<{ data?: AgentOverviewStats; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  const days = Math.min(Math.max(windowDays, 1), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const columns =
    'created_at, status, duration_ms, estimated_cost_usd, total_tokens, tools, meta'

  try {
    const service = createServiceClient()
    const windowRes = await service
      .from('agent_runs')
      .select(columns)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (windowRes.error) return { error: windowRes.error.message }

    let latestRows: OverviewSourceRow[] = []
    if ((windowRes.data || []).length === 0) {
      const latestRes = await service
        .from('agent_runs')
        .select(columns)
        .order('created_at', { ascending: false })
        .limit(500)
      if (latestRes.error) return { error: latestRes.error.message }
      latestRows = (latestRes.data || []) as OverviewSourceRow[]
    }

    const picked = pickOverviewRows(
      (windowRes.data || []) as OverviewSourceRow[],
      latestRows
    )
    return {
      data: summarizeOverview(picked.rows, {
        windowDays: days,
        outsideWindow: picked.outsideWindow,
      }),
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to load overview',
    }
  }
}
