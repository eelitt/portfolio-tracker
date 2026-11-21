/**
 * Eval tab: fixture list, run-suite control (cost confirm), latest scorecard.
 */

'use client'

import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

type EvalFeature = 'portfolio_analyst' | 'portfolio_orchestrator'

type FixtureMeta = { id: string; description: string; feature: string }

type EvalRunProgress = {
  feature: EvalFeature
  completed: number
  total: number
  passed: number
  failed: number
  caseId: string | null
}

type LatestEval = {
  run: {
    id: string
    created_at: string
    status: string
    total_cases: number
    passed: number
    failed: number
    duration_ms: number | null
    mode: string
    feature: string
  }
  results: Array<{
    case_id: string
    passed: boolean
    scores: unknown
    agent_run_id: string | null
    error_summary: string | null
  }>
}

export default function AgentEvalTab({
  fixtures,
  latest,
  loading,
  runningFeature,
  progress,
  onRunSuite,
}: {
  fixtures: FixtureMeta[]
  latest: LatestEval | null
  loading: boolean
  runningFeature: EvalFeature | null
  progress: EvalRunProgress | null
  onRunSuite: (feature: EvalFeature) => void
}) {
  const analyst = fixtures.filter((f) => f.feature === 'portfolio_analyst')
  const orchestrator = fixtures.filter((f) => f.feature === 'portfolio_orchestrator')

  const run = (feature: EvalFeature, count: number, label: string) => {
    if (
      !window.confirm(
        `Run ${count} live ${label} eval cases? This uses xAI tokens.`
      )
    ) {
      return
    }
    onRunSuite(feature)
  }
  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1 overflow-hidden">
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Analyst cases call the model on an injected book. Orchestrator cases
            call the model once and stub the specialists, so they only check
            routing. Both use xAI tokens.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            disabled={runningFeature != null || analyst.length === 0}
            onClick={() => run('portfolio_analyst', analyst.length, 'analyst')}
          >
            {runningFeature === 'portfolio_analyst'
              ? 'Running…'
              : `Run analyst (${analyst.length})`}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={runningFeature != null || orchestrator.length === 0}
            onClick={() =>
              run('portfolio_orchestrator', orchestrator.length, 'orchestrator')
            }
          >
            {runningFeature === 'portfolio_orchestrator'
              ? 'Running…'
              : `Run orchestrator (${orchestrator.length})`}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="shrink-0 space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {progress.feature === 'portfolio_orchestrator' ? 'Orchestrator' : 'Analyst'}{' '}
              <span className="tabular-nums">
                {progress.completed}/{progress.total}
              </span>
              {progress.caseId ? (
                <span className="font-mono"> · {progress.caseId}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums">
              {progress.passed} pass · {progress.failed} fail
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
            aria-label="Eval suite progress"
          >
            <div
              className="h-full bg-gold transition-[width] duration-200 motion-reduce:transition-none"
              style={{
                width:
                  progress.total > 0
                    ? `${Math.min(100, (progress.completed / progress.total) * 100)}%`
                    : '0%',
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-col min-h-0 border border-border rounded-md overflow-hidden">
          <div className="px-2 py-1.5 text-xs font-medium border-b border-border bg-muted/30">
            Fixtures ({fixtures.length})
          </div>
          <ul className="overflow-y-auto text-xs p-2 space-y-1.5 flex-1">
            {loading && fixtures.length === 0 ? (
              <li className="text-muted-foreground">Loading…</li>
            ) : (
              fixtures.map((f) => (
                <li key={f.id}>
                  <span className="font-mono text-[11px]">{f.id}</span>
                  <span className="ml-2 text-muted-foreground">{f.feature}</span>
                  <p className="text-muted-foreground">{f.description}</p>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="flex flex-col min-h-0 border border-border rounded-md overflow-hidden">
          <div className="px-2 py-1.5 text-xs font-medium border-b border-border bg-muted/30">
            Latest scorecard
          </div>
          <div className="overflow-y-auto p-2 text-xs flex-1 space-y-2">
            {!latest ? (
              <p className="text-muted-foreground">No eval runs yet.</p>
            ) : (
              <>
                <p>
                  <span className="text-muted-foreground">
                    {format(new Date(latest.run.created_at), 'MMM d HH:mm')} ·{' '}
                    {latest.run.feature} · {latest.run.status}
                  </span>
                  <br />
                  <span className="tabular-nums">
                    {latest.run.passed} passed / {latest.run.failed} failed ·{' '}
                    {latest.run.duration_ms != null
                      ? `${(latest.run.duration_ms / 1000).toFixed(1)}s`
                      : '—'}
                  </span>
                </p>
                <ul className="space-y-1">
                  {latest.results.map((r) => (
                    <li
                      key={r.case_id}
                      className="flex items-start justify-between gap-2 border-b border-border/40 py-1"
                    >
                      <span className="font-mono truncate">{r.case_id}</span>
                      <span
                        className={
                          r.passed ? 'text-emerald-400 shrink-0' : 'text-red-400 shrink-0'
                        }
                      >
                        {r.passed ? 'pass' : 'fail'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
