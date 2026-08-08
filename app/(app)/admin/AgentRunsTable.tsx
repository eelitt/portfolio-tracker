/**
 * Runs tab: sortable list of agent_runs + detail panel (tools / usage).
 */

'use client'

import type { AgentRunRow } from '@/lib/agentObservability'
import { format } from 'date-fns'

function statusClass(status: string) {
  switch (status) {
    case 'success':
      return 'text-emerald-400'
    case 'error':
      return 'text-red-400'
    case 'partial':
      return 'text-amber-400'
    default:
      return 'text-muted-foreground'
  }
}

export default function AgentRunsTable({
  runs,
  selectedId,
  onSelect,
  loading,
}: {
  runs: AgentRunRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
}) {
  if (loading && runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Loading runs…
      </p>
    )
  }

  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No agent runs yet.
      </p>
    )
  }

  return (
    <div className="overflow-auto min-h-0 flex-1 border border-border rounded-md">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-background border-b border-border">
          <tr className="text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">When</th>
            <th className="px-2 py-1.5 font-medium">Feature</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">Tools</th>
            <th className="px-2 py-1.5 font-medium">ms</th>
            <th className="px-2 py-1.5 font-medium">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-border/40 cursor-pointer hover:bg-muted/40 ${
                selectedId === r.id ? 'bg-muted/60' : ''
              }`}
              onClick={() => onSelect(r.id)}
            >
              <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                {format(new Date(r.created_at), 'MMM d HH:mm')}
              </td>
              <td className="px-2 py-1.5 font-mono truncate max-w-[8rem]">
                {r.feature}
              </td>
              <td className={`px-2 py-1.5 ${statusClass(r.status)}`}>{r.status}</td>
              <td className="px-2 py-1.5 tabular-nums">{r.tools?.length ?? 0}</td>
              <td className="px-2 py-1.5 tabular-nums">
                {r.duration_ms ?? '—'}
              </td>
              <td className="px-2 py-1.5 tabular-nums">
                {r.total_tokens ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Right-hand panel: tokens, cost, child agents, redacted tool args/results. */
export function AgentRunDetail({
  run,
  childrenRuns = [],
}: {
  run: AgentRunRow | null
  childrenRuns?: AgentRunRow[]
}) {
  if (!run) {
    return (
      <p className="text-xs text-muted-foreground p-2">
        Select a run to inspect tools and usage.
      </p>
    )
  }

  return (
    <div className="space-y-2 text-xs overflow-y-auto min-h-0 flex-1 p-1">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span className="text-muted-foreground">Model</span>
        <span className="font-mono">{run.model ?? '—'}</span>
        <span className="text-muted-foreground">Role</span>
        <span className="font-mono">
          {run.agent_role ?? (run.meta?.agent_role as string) ?? '—'}
        </span>
        <span className="text-muted-foreground">Cost (est.)</span>
        <span className="tabular-nums">
          {run.estimated_cost_usd != null
            ? `≈ $${run.estimated_cost_usd.toFixed(4)}`
            : '—'}
        </span>
        <span className="text-muted-foreground">Tokens in/out</span>
        <span className="tabular-nums">
          {run.prompt_tokens ?? '—'} / {run.completion_tokens ?? '—'}
        </span>
        {run.error_summary ? (
          <>
            <span className="text-muted-foreground">Error</span>
            <span className="text-red-400 break-words">{run.error_summary}</span>
          </>
        ) : null}
        {run.meta?.eval_case_id ? (
          <>
            <span className="text-muted-foreground">Eval case</span>
            <span className="font-mono">{String(run.meta.eval_case_id)}</span>
          </>
        ) : null}
      </div>

      {childrenRuns.length > 0 ? (
        <div>
          <h4 className="font-medium text-muted-foreground pt-1">Child agents</h4>
          <ul className="space-y-1 mt-1">
            {childrenRuns.map((c) => (
              <li
                key={c.id}
                className="flex justify-between gap-2 border-b border-border/40 py-1"
              >
                <span className="font-mono truncate">
                  {c.agent_role ?? c.feature}
                </span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {c.status}
                  {c.duration_ms != null ? ` · ${c.duration_ms}ms` : ''}
                  {c.estimated_cost_usd != null
                    ? ` · ≈$${Number(c.estimated_cost_usd).toFixed(4)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h4 className="font-medium text-muted-foreground pt-1">Tools</h4>
      {(!run.tools || run.tools.length === 0) && (
        <p className="text-muted-foreground">No tools recorded.</p>
      )}
      <ul className="space-y-2">
        {(run.tools || []).map((t, i) => (
          <li
            key={`${t.name}-${i}`}
            className="rounded border border-border/60 bg-muted/20 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-medium">{t.name}</span>
              <span className={t.ok ? 'text-emerald-400' : 'text-red-400'}>
                {t.ok ? 'ok' : 'fail'}
                {t.latency_ms != null ? ` · ${t.latency_ms}ms` : ''}
              </span>
            </div>
            {t.error ? (
              <p className="text-red-400/90 mt-1 break-words">{t.error}</p>
            ) : null}
            <pre className="mt-1 max-h-24 overflow-auto text-[10px] text-muted-foreground whitespace-pre-wrap">
              {JSON.stringify({ args: t.args, result: t.result }, null, 0)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  )
}
