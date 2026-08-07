/**
 * Eval tab: fixture list, run-suite control (cost confirm), latest scorecard.
 */

'use client'

import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

type FixtureMeta = { id: string; description: string; feature: string }

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
  running,
  onRunSuite,
}: {
  fixtures: FixtureMeta[]
  latest: LatestEval | null
  loading: boolean
  running: boolean
  onRunSuite: () => void
}) {
  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1 overflow-hidden">
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Live suite calls the model once per fixture ({fixtures.length} cases)
            with injected portfolio data. Estimated cost and latency apply.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={running || fixtures.length === 0}
          onClick={() => {
            if (
              !window.confirm(
                `Run ${fixtures.length} live LLM eval cases? This uses xAI tokens.`
              )
            ) {
              return
            }
            onRunSuite()
          }}
        >
          {running ? 'Running…' : 'Run suite (live)'}
        </Button>
      </div>

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
                    {latest.run.status}
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
