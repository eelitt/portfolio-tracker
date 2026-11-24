/**
 * Runs tab: sortable list of agent_runs + detail panel (tools / usage).
 */

'use client'

import type { AgentRunRow } from '@/lib/agentObservability'
import { callerLabel } from '@/lib/agentObservability/caller'
import { readOrchestratorRoute } from '@/lib/agentObservability/routeMeta'
import { format } from 'date-fns'

const SIGNAL_LABELS: Record<string, string> = {
  prompt_leak: 'prompt leak',
  no_specialist: 'no specialist',
  watchlist_write: 'watchlist write',
  prepare_ran: 'prepare ran',
  answered_without_tools: 'answer without tools',
}

function metaText(meta: AgentRunRow['meta'], key: string): string {
  const value = meta?.[key]
  return typeof value === 'string' ? value : ''
}

function trueSignals(meta: AgentRunRow['meta']): string[] {
  const signals = meta?.policy_signals
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) {
    return []
  }
  return Object.entries(signals as Record<string, unknown>)
    .filter(([, on]) => on === true)
    .map(([key]) => SIGNAL_LABELS[key] ?? key)
}

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
  emptyLabel,
}: {
  runs: AgentRunRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading: boolean
  emptyLabel?: string
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
        {emptyLabel ?? 'No agent runs yet.'}
      </p>
    )
  }

  return (
    <div className="overflow-auto min-h-0 flex-1 border border-border rounded-md">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-background border-b border-border">
          <tr className="text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">When</th>
            <th className="px-2 py-1.5 font-medium">Caller</th>
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
              <td className="px-2 py-1.5 truncate max-w-[10rem]" title={callerLabel(r.user_email, r.user_id)}>
                {callerLabel(r.user_email, r.user_id)}
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
  parentRun = null,
  loading = false,
  missing = false,
  parentLoading = false,
}: {
  run: AgentRunRow | null
  childrenRuns?: AgentRunRow[]
  /** Parent chat row when this run is a specialist child. */
  parentRun?: AgentRunRow | null
  /** True while the selected row is still being read. */
  loading?: boolean
  /** True when that read failed and there is no row to show. */
  missing?: boolean
  /** True while the parent question is still being read. */
  parentLoading?: boolean
}) {
  if (!run) {
    if (loading) {
      return (
        <div className="space-y-2 p-2">
          <p className="text-xs text-muted-foreground">Opening run…</p>
          <div className="skeleton-block h-3 w-2/3" />
          <div className="skeleton-block h-3 w-full" />
        </div>
      )
    }
    if (missing) {
      return (
        <p className="text-xs text-muted-foreground p-2">
          This run could not be loaded.
        </p>
      )
    }
    return (
      <p className="text-xs text-muted-foreground p-2">
        Select a run to inspect tools and usage.
      </p>
    )
  }

  const route = readOrchestratorRoute(run.meta?.route)
  const parentAsked = parentRun ? metaText(parentRun.meta, 'user_text') : ''
  const asked = metaText(run.meta, 'user_text')
  const reply = metaText(run.meta, 'assistant_text')
  const subject = metaText(run.meta, 'subject')
  const signals = trueSignals(run.meta)
  const caller = callerLabel(run.user_email, run.user_id)

  return (
    <div className="space-y-2 text-xs overflow-y-auto min-h-0 flex-1 p-1 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span className="text-muted-foreground">Caller</span>
        <span className="break-all">{caller}</span>
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

      {subject && !asked ? (
        <div>
          <h4 className="font-medium text-muted-foreground pt-1">Subject</h4>
          <p className="break-words">{subject}</p>
        </div>
      ) : null}

      {parentLoading || parentAsked || asked ? (
        <div>
          <h4 className="font-medium text-muted-foreground pt-1">Asked</h4>
          {parentLoading ? (
            <div className="skeleton-block mt-1 h-4 w-full" />
          ) : (
            <p className="break-words whitespace-pre-wrap animate-in fade-in-0 duration-200 motion-reduce:animate-none">
              {parentAsked || asked}
            </p>
          )}
        </div>
      ) : null}

      {reply ? (
        <div>
          <h4 className="font-medium text-muted-foreground pt-1">Reply</h4>
          <p className="break-words whitespace-pre-wrap">{reply}</p>
        </div>
      ) : null}

      {signals.length > 0 ? (
        <p className="text-amber-400 break-words">
          Signals: {signals.join(', ')}
        </p>
      ) : null}

      {route.length > 0 ? (
        <div>
          <h4 className="font-medium text-muted-foreground pt-1">Route</h4>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            {route.map((step, i) => {
              const detail = [
                step.task,
                step.universe,
                step.mode,
                step.forceRefresh ? 'refresh' : undefined,
                step.symbols?.join(', '),
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={`${step.name}-${i}`}>
                  <span className="font-mono">{step.name}</span>{' '}
                  <span className={step.ok ? 'text-emerald-400' : 'text-red-400'}>
                    {step.ok ? 'ok' : 'fail'}
                  </span>
                  {detail ? (
                    <span className="text-muted-foreground"> · {detail}</span>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}

      {childrenRuns.length > 0 ? (
        <div>
          <h4 className="font-medium text-muted-foreground pt-1">Child agents</h4>
          <ul className="space-y-1 mt-1">
            {childrenRuns.map((c) => {
              const childReply = metaText(c.meta, 'assistant_text')
              const childSubject = metaText(c.meta, 'subject')
              const childSignals = trueSignals(c.meta)
              return (
                <li
                  key={c.id}
                  className="border-b border-border/40 py-1 space-y-1"
                >
                  <div className="flex justify-between gap-2">
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
                  </div>
                  {childSubject ? (
                    <p className="break-words text-muted-foreground">{childSubject}</p>
                  ) : null}
                  {childSignals.length > 0 ? (
                    <p className="text-amber-400 break-words">
                      Signals: {childSignals.join(', ')}
                    </p>
                  ) : null}
                  {childReply ? (
                    <p className="break-words whitespace-pre-wrap text-muted-foreground">
                      {childReply}
                    </p>
                  ) : null}
                </li>
              )
            })}
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
