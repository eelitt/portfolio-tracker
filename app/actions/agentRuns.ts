/**
 * Admin reads of agent_runs for the Runs tab.
 */

'use server'

import { createServiceClient } from '@/lib/supabase/admin'
import type { AgentRunMeta, AgentRunRow, AgentToolRecord } from '@/lib/agentObservability'
import { agentRunListFilters } from '@/lib/agentObservability/runListQuery'
import { requireAdmin } from '@/lib/requireAdmin'

function mapRunRow(row: Record<string, unknown>): AgentRunRow {
  return {
    id: row.id as string,
    created_at: row.created_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
    user_id: row.user_id as string,
    feature: row.feature as string,
    schema_version: Number(row.schema_version ?? 1),
    status: row.status as AgentRunRow['status'],
    model: (row.model as string | null) ?? null,
    duration_ms: row.duration_ms != null ? Number(row.duration_ms) : null,
    step_count: Number(row.step_count ?? 0),
    prompt_tokens: row.prompt_tokens != null ? Number(row.prompt_tokens) : null,
    completion_tokens:
      row.completion_tokens != null ? Number(row.completion_tokens) : null,
    total_tokens: row.total_tokens != null ? Number(row.total_tokens) : null,
    estimated_cost_usd:
      row.estimated_cost_usd != null ? Number(row.estimated_cost_usd) : null,
    tools: (row.tools as AgentToolRecord[]) || [],
    meta: (row.meta as AgentRunMeta) || {},
    error_summary: (row.error_summary as string | null) ?? null,
    parent_run_id: (row.parent_run_id as string | null) ?? null,
    agent_role: (row.agent_role as string | null) ?? null,
  }
}

/** Auth email for each id. A failed lookup leaves that id out of the map. */
async function emailsForUserIds(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const emails = new Map<string, string>()
  if (unique.length === 0) return emails

  const service = createServiceClient()
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data, error } = await service.auth.admin.getUserById(id)
        const email = data?.user?.email?.trim()
        if (!error && email) emails.set(id, email)
      } catch (e) {
        console.error(
          'agent run email lookup failed:',
          e instanceof Error ? e.message : 'unknown'
        )
      }
    })
  )
  return emails
}

function withCaller(row: AgentRunRow, emails: Map<string, string>): AgentRunRow {
  return { ...row, user_email: emails.get(row.user_id) ?? null }
}

/** Recent agent_runs for the Runs tab (newest first). */
export async function listAgentRuns(opts?: {
  limit?: number
  feature?: string
  userId?: string
  status?: string
  /** Inclusive ISO timestamp. A local day is converted before this call. */
  from?: string
  /** Inclusive ISO timestamp. */
  to?: string
  /** When true (default), only top-level runs (no parent). */
  parentsOnly?: boolean
}): Promise<{ data?: AgentRunRow[]; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }

  try {
    const service = createServiceClient()
    const limit = Math.min(opts?.limit ?? 50, 100)
    const filters = agentRunListFilters({
      userId: opts?.userId,
      feature: opts?.feature,
      status: opts?.status,
      from: opts?.from,
      to: opts?.to,
    })
    let q = service
      .from('agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (filters.userId) q = q.eq('user_id', filters.userId)
    if (filters.feature) q = q.eq('feature', filters.feature)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.from) q = q.gte('created_at', filters.from)
    if (filters.to) q = q.lte('created_at', filters.to)
    if (opts?.parentsOnly !== false) {
      q = q.is('parent_run_id', null)
    }

    const { data, error } = await q
    if (error) return { error: error.message }
    const rows = (data || []).map((r) => mapRunRow(r as Record<string, unknown>))
    const emails = await emailsForUserIds(rows.map((r) => r.user_id))
    return { data: rows.map((r) => withCaller(r, emails)) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to list agent runs' }
  }
}

/** Child agent_runs for a parent orchestrator run. */
export async function listChildAgentRuns(
  parentRunId: string
): Promise<{ data?: AgentRunRow[]; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }
  if (!parentRunId) return { error: 'Missing parent run id' }

  try {
    const service = createServiceClient()
    const { data, error } = await service
      .from('agent_runs')
      .select('*')
      .eq('parent_run_id', parentRunId)
      .order('created_at', { ascending: true })

    if (error) return { error: error.message }
    const rows = (data || []).map((r) => mapRunRow(r as Record<string, unknown>))
    const emails = await emailsForUserIds(rows.map((r) => r.user_id))
    return { data: rows.map((r) => withCaller(r, emails)) }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to list child agent runs',
    }
  }
}

/** Single run detail (tools timeline). */
export async function getAgentRun(
  id: string
): Promise<{ data?: AgentRunRow; error?: string }> {
  const gate = await requireAdmin()
  if (gate.error) return { error: gate.error }
  if (!id) return { error: 'Missing run id' }

  try {
    const service = createServiceClient()
    const { data, error } = await service
      .from('agent_runs')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) return { error: error.message }
    if (!data) return { error: 'Run not found' }
    const row = mapRunRow(data as Record<string, unknown>)
    const emails = await emailsForUserIds([row.user_id])
    return { data: withCaller(row, emails) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load agent run' }
  }
}
