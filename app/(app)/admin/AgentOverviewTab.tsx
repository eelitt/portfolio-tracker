/**
 * Overview tab: window presets, volume, error rate, latency/cost, tool errors.
 */

'use client'

import { useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import type {
  AgentOverviewStats,
  OverviewPreset,
  OverviewToolRow,
  OverviewToolSample,
} from '@/lib/agentObservability/overviewRows'

const PRESETS: { id: OverviewPreset; label: string }[] = [
  { id: 'week', label: 'Last week' },
  { id: 'month', label: 'Last month' },
  { id: 'all', label: 'All time' },
]

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

function fmtMs(n: number | null) {
  if (n == null) return '—'
  if (n < 1000) return `${Math.round(n)} ms`
  return `${(n / 1000).toFixed(1)} s`
}

function fmtCost(n: number | null) {
  if (n == null) return '—'
  return `≈ $${n.toFixed(4)}`
}

function emptyCopy(preset: OverviewPreset) {
  if (preset === 'week') return 'No agent runs in the last 7 days.'
  if (preset === 'all') return 'No agent runs yet.'
  return 'No agent runs in the last 30 days.'
}

/** Padding room so a 2% scale stays inside the clip and cannot paint past the modal. */
const zoomClip = 'overflow-hidden px-3 py-1'
const rowZoom =
  'rounded-md transition-transform duration-200 ease-out hover:scale-[1.02] motion-reduce:transform-none'

function fmtWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return format(d, 'MMM d HH:mm')
}

function ToolSampleRow({
  sample,
  onOpenRun,
}: {
  sample: OverviewToolSample
  onOpenRun: (runId: string) => void
}) {
  const args = JSON.stringify(sample.args)
  return (
    <li className={zoomClip}>
      <button
        type="button"
        onClick={() => onOpenRun(sample.runId)}
        className={`block w-full cursor-pointer space-y-1 rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-left font-inherit ${rowZoom}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">
            {fmtWhen(sample.createdAt)}
            {sample.feature ? ` · ${sample.feature}` : ''}
            {' · '}
            <span className={sample.ok ? 'text-emerald-400' : 'text-red-400'}>
              {sample.ok ? 'ok' : 'fail'}
            </span>
            {sample.latencyMs != null ? ` · ${sample.latencyMs} ms` : ''}
          </span>
          <span className="text-xs underline underline-offset-2">
            Open run
          </span>
        </div>
        {sample.error ? (
          <p className="text-red-400/90 break-words">{sample.error}</p>
        ) : null}
        {args !== '{}' ? (
          <pre className="max-h-20 overflow-auto text-[10px] text-muted-foreground whitespace-pre-wrap">
            {args}
          </pre>
        ) : null}
      </button>
    </li>
  )
}

function ownerHeading(owner: OverviewToolRow['owner']) {
  if (owner === 'orchestrator') return 'Orchestrator'
  if (owner === 'portfolio_analyst') return 'Portfolio analyst'
  return 'Not in the registry'
}

function toolGroups(tools: OverviewToolRow[]) {
  const groups: Array<{ key: string; label: string; rows: OverviewToolRow[] }> = []
  for (const tool of tools) {
    const key = tool.owner ?? 'unknown'
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(tool)
    else groups.push({ key, label: ownerHeading(tool.owner), rows: [tool] })
  }
  return groups
}

function windowCopy(stats: AgentOverviewStats) {
  const range =
    stats.windowDays == null ? 'All time' : `Last ${stats.windowDays} days`
  const scope = stats.capped
    ? `newest ${stats.totalRuns} rows, including specialist children and eval`
    : 'includes specialist children and eval'
  return `${range} · ${scope}`
}

export default function AgentOverviewTab({
  stats,
  loading,
  error,
  preset,
  onPreset,
  onOpenRun,
}: {
  stats: AgentOverviewStats | null
  loading: boolean
  error?: string | null
  preset: OverviewPreset
  onPreset: (preset: OverviewPreset) => void
  onOpenRun: (runId: string) => void
}) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const cards = stats
    ? [
        { label: 'Runs', value: String(stats.totalRuns) },
        { label: 'Error rate', value: pct(stats.errorRate) },
        { label: 'Avg latency', value: fmtMs(stats.avgDurationMs) },
        { label: 'Total cost (est.)', value: fmtCost(stats.totalEstimatedCostUsd) },
        { label: 'Avg cost (est.)', value: fmtCost(stats.avgEstimatedCostUsd) },
        {
          label: 'Avg tokens',
          value:
            stats.avgTotalTokens != null
              ? String(Math.round(stats.avgTotalTokens))
              : '—',
        },
        {
          label: 'Confirm blocked',
          value: `${stats.confirmBlocked} / ${stats.confirmAttempts || 0}`,
        },
      ]
    : []

  let body: ReactNode
  if (loading && !stats) {
    body = (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Loading overview…
      </p>
    )
  } else if (error) {
    body = (
      <p className="text-sm text-destructive py-6 text-center">{error}</p>
    )
  } else if (!stats) {
    body = (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {emptyCopy(preset)}
      </p>
    )
  } else {
    body = (
      <>
        {stats.totalRuns === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {emptyCopy(preset)}
          </p>
        ) : (
          <>
        <p className="text-xs text-muted-foreground">
          {windowCopy(stats)}
          {' · '}
          success {stats.successCount} · error {stats.errorCount} · partial{' '}
          {stats.partialCount} · running {stats.runningCount}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {c.label}
              </div>
              <div className="text-sm font-medium tabular-nums mt-0.5">
                {c.value}
              </div>
            </div>
          ))}
        </div>
          </>
        )}

        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">
            Tools (errors / total)
          </h4>
          {stats.tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tool calls recorded.</p>
          ) : (
            <div className="space-y-3">
              {toolGroups(stats.tools).map((group) => (
                <div key={group.key}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    {group.label}
                  </p>
            <ul className="space-y-1 text-sm">
              {group.rows.map((t) => {
                const open = expandedTool === t.name
                const noEval = t.inRegistry && !t.covered
                return (
                  <li key={t.name} className="border-b border-border/50">
                    <div className={zoomClip}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setExpandedTool(open ? null : t.name)}
                        className={`flex w-full items-center justify-between gap-2 px-1 py-1 text-left ${rowZoom}`}
                      >
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="min-w-0 truncate font-mono text-xs underline-offset-2 hover:underline">
                            {t.name}
                          </span>
                          {t.sideEffect ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {t.sideEffect}
                            </span>
                          ) : null}
                          {t.requiresConfirmation ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              confirm
                            </span>
                          ) : null}
                          {noEval ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              no eval
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular-nums text-muted-foreground shrink-0 text-xs">
                          {t.errors}/{t.total}
                        </span>
                      </button>
                    </div>
                    {open ? (
                      <div className="mb-1 space-y-2 px-1">
                        {t.label ? (
                          <p className="text-xs text-muted-foreground">{t.label}</p>
                        ) : null}
                        {noEval ? (
                          <p className="text-xs text-muted-foreground">
                            No fixture expects this tool to be called.
                          </p>
                        ) : null}
                        {t.total === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No calls in this window.
                          </p>
                        ) : (
                          <>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Errors
                          </p>
                          {t.errorGroups.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No errors in this window.
                            </p>
                          ) : (
                            <ul className="mt-1 space-y-1">
                              {t.errorGroups.map((group) => (
                                <li key={group.error} className={zoomClip}>
                                  <div
                                    className={`flex justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-xs ${rowZoom}`}
                                  >
                                    <span className="break-words text-red-400/90">
                                      {group.error}
                                    </span>
                                    <span className="tabular-nums text-muted-foreground shrink-0">
                                      {group.count}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Newest calls
                          </p>
                          {t.recent.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No calls recorded.
                            </p>
                          ) : (
                            <ul className="mt-1 space-y-1">
                              {t.recent.map((sample, index) => (
                                <ToolSampleRow
                                  key={`${sample.runId}-${index}`}
                                  sample={sample}
                                  onOpenRun={onOpenRun}
                                />
                              ))}
                            </ul>
                          )}
                        </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="space-y-4 overflow-x-hidden overflow-y-auto min-h-0 flex-1">
      <div className="flex gap-1">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPreset(item.id)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              preset === item.id
                ? 'bg-muted font-medium'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {body}
    </div>
  )
}
