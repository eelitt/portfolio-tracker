/**
 * Admin modal: Overview | Runs | Eval for agent_runs and the live eval suite.
 * Data via Server Actions; suite execution via /api/admin/agent-eval.
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { getAgentOverview } from '@/app/actions/agentOverview'
import { getAgentRun, listAgentRuns, listChildAgentRuns } from '@/app/actions/agentRuns'
import { getLatestEvalRun, listEvalCases } from '@/app/actions/agentEval'
import { listAiUserStats, type AiUserStatRow } from '@/app/actions/aiUserStats'
import type { AgentRunRow, AgentRunStatus } from '@/lib/agentObservability'
import type { AgentOverviewStats } from '@/lib/agentObservability/overviewRows'
import {
  RUN_FILTER_FEATURES,
  localDayBound,
} from '@/lib/agentObservability/runListQuery'
import AgentOverviewTab from './AgentOverviewTab'
import AgentRunsTable, { AgentRunDetail } from './AgentRunsTable'
import AgentUsersTab from './AgentUsersTab'
import AgentEvalTab from './AgentEvalTab'
import { parseEvalProgressLine, type EvalProgressEvent } from '@/lib/agentEval/progress'

const filterControlClass =
  'h-7 max-w-[14rem] rounded-md border border-border bg-background px-2 text-xs text-foreground'

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      {label}
      <select
        className={filterControlClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  )
}

type Tab = 'overview' | 'runs' | 'users' | 'eval'
type EvalFeature = 'portfolio_analyst' | 'portfolio_orchestrator'

type EvalRunProgress = {
  feature: EvalFeature
  completed: number
  total: number
  passed: number
  failed: number
  caseId: string | null
}

async function readEvalProgress(
  res: Response,
  onEvent: (event: EvalProgressEvent) => void
) {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Eval response had no body')
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const event = parseEvalProgressLine(line)
      if (event) onEvent(event)
    }
  }
  const tail = parseEvalProgressLine(buf)
  if (tail) onEvent(tail)
}

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
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [runs, setRuns] = useState<AgentRunRow[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [userStats, setUserStats] = useState<AiUserStatRow[]>([])
  const [usersError, setUsersError] = useState<string | null>(null)
  const [callerUserId, setCallerUserId] = useState('all')
  const [featureFilter, setFeatureFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | AgentRunStatus>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<AgentRunRow | null>(null)
  const [childRuns, setChildRuns] = useState<AgentRunRow[]>([])
  const [fixtures, setFixtures] = useState<
    Array<{ id: string; description: string; feature: string }>
  >([])
  const [latestEval, setLatestEval] = useState<Awaited<
    ReturnType<typeof getLatestEvalRun>
  >['data']>(null)
  const [runningFeature, setRunningFeature] = useState<EvalFeature | null>(null)
  const [evalProgress, setEvalProgress] = useState<EvalRunProgress | null>(null)

  const runsRequest = useRef(0)
  const loadRuns = useCallback(async () => {
    const request = ++runsRequest.current
    setRunsLoading(true)
    try {
      const list = await listAgentRuns({
        limit: 50,
        userId: callerUserId === 'all' ? undefined : callerUserId,
        feature: featureFilter === 'all' ? undefined : featureFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        from: fromDate ? localDayBound(fromDate, 'start') : undefined,
        to: toDate ? localDayBound(toDate, 'end') : undefined,
      })
      if (request !== runsRequest.current) return
      if (list.error) toast.error(list.error)
      else setRuns(list.data ?? [])
    } finally {
      if (request === runsRequest.current) setRunsLoading(false)
    }
  }, [callerUserId, featureFilter, statusFilter, fromDate, toDate])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [ov, cases, latest, users] = await Promise.all([
      getAgentOverview(30),
      listEvalCases(),
      getLatestEvalRun(),
      listAiUserStats(),
    ])

    if (ov.error) {
      toast.error(ov.error)
      setOverviewError(ov.error)
      setOverview(null)
    } else {
      setOverviewError(null)
      setOverview(ov.data ?? null)
    }

    if (cases.error) toast.error(cases.error)
    else setFixtures(cases.data ?? [])

    if (latest.error) toast.error(latest.error)
    else setLatestEval(latest.data ?? null)

    if (users.error) {
      toast.error(users.error)
      setUsersError(users.error)
      setUserStats([])
    } else {
      setUsersError(null)
      setUserStats(users.data ?? [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    void loadAll()
  }, [open, loadAll])

  useEffect(() => {
    if (!open) return
    void loadRuns()
  }, [open, loadRuns])

  const callerChoices = useMemo(() => {
    const rows = userStats
      .map((row) => ({ userId: row.userId, caller: row.caller }))
      .sort((a, b) => a.caller.localeCompare(b.caller))
    if (
      callerUserId !== 'all' &&
      !rows.some((row) => row.userId === callerUserId)
    ) {
      rows.push({ userId: callerUserId, caller: callerUserId })
      rows.sort((a, b) => a.caller.localeCompare(b.caller))
    }
    return rows
  }, [userStats, callerUserId])

  const featureChoices = useMemo(() => {
    const names = new Set<string>(RUN_FILTER_FEATURES)
    for (const run of runs) names.add(run.feature)
    if (featureFilter !== 'all') names.add(featureFilter)
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [runs, featureFilter])

  const filtersActive =
    callerUserId !== 'all' ||
    featureFilter !== 'all' ||
    statusFilter !== 'all' ||
    fromDate !== '' ||
    toDate !== ''

  useEffect(() => {
    if (!selectedId) return
    if (!runs.some((r) => r.id === selectedId)) setSelectedId(null)
  }, [selectedId, runs])

  useEffect(() => {
    if (!selectedId) {
      setSelectedRun(null)
      setChildRuns([])
      return
    }
    let cancelled = false
    const cached = runs.find((r) => r.id === selectedId)
    if (cached) setSelectedRun(cached)
    void getAgentRun(selectedId).then((res) => {
      if (!cancelled && res.data) setSelectedRun(res.data)
    })
    void listChildAgentRuns(selectedId).then((res) => {
      if (!cancelled) setChildRuns(res.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [selectedId, runs])

  /** Live suite — API route holds the long timeout budget. */
  const handleRunSuite = useCallback(async (feature: EvalFeature) => {
    const total = fixtures.filter((f) => f.feature === feature).length
    setRunningFeature(feature)
    setEvalProgress({
      feature,
      completed: 0,
      total,
      passed: 0,
      failed: 0,
      caseId: null,
    })
    try {
      const res = await fetch('/api/admin/agent-eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature }),
      })
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('ndjson')) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error || `Eval failed (${res.status})`)
        return
      }

      const outcome: {
        done: Extract<EvalProgressEvent, { type: 'done' }> | null
        error: string | null
      } = { done: null, error: null }
      await readEvalProgress(res, (event) => {
        if (event.type === 'start') {
          setEvalProgress((prev) => (prev ? { ...prev, total: event.total } : prev))
        } else if (event.type === 'case') {
          setEvalProgress((prev) =>
            prev
              ? {
                  ...prev,
                  completed: event.index,
                  total: event.total,
                  caseId: event.caseId,
                  passed: prev.passed + (event.passed ? 1 : 0),
                  failed: prev.failed + (event.passed ? 0 : 1),
                }
              : prev
          )
        } else if (event.type === 'done') {
          outcome.done = event
        } else {
          outcome.error = event.error
        }
      })

      if (outcome.error) {
        toast.error(outcome.error)
        return
      }
      if (!outcome.done) {
        toast.error('Eval ended before a result')
        return
      }
      toast.success(
        `Eval done: ${outcome.done.passed}/${outcome.done.total} passed (${(outcome.done.durationMs / 1000).toFixed(1)}s)`
      )
      await Promise.all([loadAll(), loadRuns()])
      setTab('eval')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Eval request failed')
    } finally {
      setRunningFeature(null)
      setEvalProgress(null)
    }
  }, [fixtures, loadAll, loadRuns])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'runs', label: 'Runs' },
    { id: 'users', label: 'Users' },
    { id: 'eval', label: 'Eval' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>Agent observability</DialogTitle>
              <DialogDescription>
                Run logs, per-user usage, and the eval suite (admin only).
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => {
                void loadAll()
                void loadRuns()
              }}
              disabled={loading || runningFeature != null}
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
            <AgentOverviewTab
              stats={overview}
              loading={loading}
              error={overviewError}
            />
          )}
          {tab === 'runs' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-0 flex-1 overflow-hidden">
              <div className="min-h-0 flex flex-col gap-2 overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0">
                  <FilterSelect
                    label="Caller"
                    value={callerUserId}
                    onChange={setCallerUserId}
                  >
                    <option value="all">All</option>
                    {callerChoices.map((row) => (
                      <option key={row.userId} value={row.userId}>
                        {row.caller}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Feature"
                    value={featureFilter}
                    onChange={setFeatureFilter}
                  >
                    <option value="all">All</option>
                    {featureChoices.map((feature) => (
                      <option key={feature} value={feature}>
                        {feature}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={(value) =>
                      setStatusFilter(value as 'all' | AgentRunStatus)
                    }
                  >
                    <option value="all">All</option>
                    <option value="running">running</option>
                    <option value="success">success</option>
                    <option value="error">error</option>
                    <option value="partial">partial</option>
                  </FilterSelect>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    From
                    <input
                      type="date"
                      className={filterControlClass}
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    To
                    <input
                      type="date"
                      className={filterControlClass}
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground shrink-0">
                  Newest 50 matching parent runs.
                </p>
                <AgentRunsTable
                  runs={runs}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  loading={loading || runsLoading}
                  emptyLabel={
                    filtersActive ? 'No runs match these filters.' : undefined
                  }
                />
              </div>
              <div className="border border-border rounded-md min-h-0 flex flex-col overflow-hidden">
                <div className="px-2 py-1.5 text-xs font-medium border-b border-border bg-muted/30">
                  Detail
                </div>
                <AgentRunDetail run={selectedRun} childrenRuns={childRuns} />
              </div>
            </div>
          )}
          {tab === 'users' && (
            <AgentUsersTab
              rows={userStats}
              loading={loading}
              error={usersError}
              onOpenRuns={(userId) => {
                setCallerUserId(userId)
                setFeatureFilter('all')
                setStatusFilter('all')
                setFromDate('')
                setToDate('')
                setTab('runs')
              }}
            />
          )}
          {tab === 'eval' && (
            <AgentEvalTab
              fixtures={fixtures}
              latest={latestEval ?? null}
              loading={loading}
              runningFeature={runningFeature}
              progress={evalProgress}
              onRunSuite={(feature) => void handleRunSuite(feature)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
