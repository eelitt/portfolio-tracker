/**
 * Admin modal: Overview | Runs | Eval for agent_runs and the live eval suite.
 * Data via Server Actions; suite execution via /api/admin/agent-eval.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  getAgentOverview,
  getAgentRun,
  getLatestEvalRun,
  listAgentRuns,
  listEvalCases,
  type AgentOverviewStats,
} from '@/app/actions/agentObservability'
import type { AgentRunRow } from '@/lib/agentObservability'
import AgentOverviewTab from './AgentOverviewTab'
import AgentRunsTable, { AgentRunDetail } from './AgentRunsTable'
import AgentEvalTab from './AgentEvalTab'

type Tab = 'overview' | 'runs' | 'eval'

interface AgentObservabilityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AgentObservabilityModal({
  open,
  onOpenChange,
}: AgentObservabilityModalProps) {
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<AgentOverviewStats | null>(null)
  const [runs, setRuns] = useState<AgentRunRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<AgentRunRow | null>(null)
  const [fixtures, setFixtures] = useState<
    Array<{ id: string; description: string; feature: string }>
  >([])
  const [latestEval, setLatestEval] = useState<Awaited<
    ReturnType<typeof getLatestEvalRun>
  >['data']>(null)
  const [evalRunning, setEvalRunning] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [ov, list, cases, latest] = await Promise.all([
      getAgentOverview(30),
      listAgentRuns({ limit: 50 }),
      listEvalCases(),
      getLatestEvalRun(),
    ])

    if (ov.error) toast.error(ov.error)
    else setOverview(ov.data ?? null)

    if (list.error) toast.error(list.error)
    else setRuns(list.data ?? [])

    if (cases.error) toast.error(cases.error)
    else setFixtures(cases.data ?? [])

    if (latest.error) toast.error(latest.error)
    else setLatestEval(latest.data ?? null)

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    void loadAll()
  }, [open, loadAll])

  useEffect(() => {
    if (!selectedId) {
      setSelectedRun(null)
      return
    }
    const cached = runs.find((r) => r.id === selectedId)
    if (cached) setSelectedRun(cached)
    void getAgentRun(selectedId).then((res) => {
      if (res.data) setSelectedRun(res.data)
    })
  }, [selectedId, runs])

  /** Live suite — API route holds the long timeout budget. */
  const handleRunSuite = useCallback(async () => {
    setEvalRunning(true)
    try {
      const res = await fetch('/api/admin/agent-eval', { method: 'POST' })
      const body = (await res.json()) as {
        error?: string
        data?: {
          passed: number
          failed: number
          total: number
          durationMs: number
        }
      }
      if (!res.ok || body.error) {
        toast.error(body.error || `Eval failed (${res.status})`)
        return
      }
      const d = body.data!
      toast.success(
        `Eval done: ${d.passed}/${d.total} passed (${(d.durationMs / 1000).toFixed(1)}s)`
      )
      await loadAll()
      setTab('eval')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eval request failed')
    } finally {
      setEvalRunning(false)
    }
  }, [loadAll])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'runs', label: 'Runs' },
    { id: 'eval', label: 'Eval' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>Agent observability</DialogTitle>
              <DialogDescription>
                Run logs, usage, and portfolio analyst eval suite (admin only).
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => void loadAll()}
              disabled={loading || evalRunning}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border pb-1 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                tab === t.id
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col min-h-[20rem] max-h-[60vh] overflow-hidden flex-1">
          {tab === 'overview' && (
            <AgentOverviewTab stats={overview} loading={loading} />
          )}
          {tab === 'runs' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-0 flex-1 overflow-hidden">
              <AgentRunsTable
                runs={runs}
                selectedId={selectedId}
                onSelect={setSelectedId}
                loading={loading}
              />
              <div className="border border-border rounded-md min-h-0 flex flex-col overflow-hidden">
                <div className="px-2 py-1.5 text-xs font-medium border-b border-border bg-muted/30">
                  Detail
                </div>
                <AgentRunDetail run={selectedRun} />
              </div>
            </div>
          )}
          {tab === 'eval' && (
            <AgentEvalTab
              fixtures={fixtures}
              latest={latestEval ?? null}
              loading={loading}
              running={evalRunning}
              onRunSuite={() => void handleRunSuite()}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
