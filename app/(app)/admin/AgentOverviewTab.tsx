/**
 * Overview tab: volume, error rate, latency/cost averages, tool error counts.
 */

'use client'

import { format } from 'date-fns'
import type { AgentOverviewStats } from '@/lib/agentObservability/overviewRows'

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

function fmtDay(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return format(d, 'MMM d')
}

export default function AgentOverviewTab({
  stats,
  loading,
  error,
}: {
  stats: AgentOverviewStats | null
  loading: boolean
  error?: string | null
}) {
  if (loading && !stats) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Loading overview…
      </p>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-6 text-center">{error}</p>
    )
  }

  if (!stats || stats.totalRuns === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No agent runs in the last {stats?.windowDays ?? 30} days. Use the Portfolio
        Analyst chat or run the eval suite to generate data.
      </p>
    )
  }

  const cards = [
    { label: 'Runs', value: String(stats.totalRuns) },
    { label: 'Error rate', value: pct(stats.errorRate) },
    { label: 'Avg latency', value: fmtMs(stats.avgDurationMs) },
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

  return (
    <div className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1">
      <p className="text-xs text-muted-foreground">
        {stats.outsideWindow
          ? `No runs in the last ${stats.windowDays} days. Figures are the latest ${stats.totalRuns} runs${
              fmtDay(stats.oldestAt) && fmtDay(stats.newestAt)
                ? `, ${fmtDay(stats.oldestAt)} – ${fmtDay(stats.newestAt)}`
                : ''
            }`
          : `Last ${stats.windowDays} days`}
        {' · '}
        success {stats.successCount} · error {stats.errorCount} · partial{' '}
        {stats.partialCount}
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
            <div className="text-sm font-medium tabular-nums mt-0.5">{c.value}</div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">
          Tool calls (errors / total)
        </h4>
        {stats.toolErrorCounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tool calls recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {stats.toolErrorCounts.map((t) => (
              <li
                key={t.name}
                className="flex justify-between gap-2 border-b border-border/50 py-1"
              >
                <span className="font-mono text-xs truncate">{t.name}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {t.errors}/{t.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
