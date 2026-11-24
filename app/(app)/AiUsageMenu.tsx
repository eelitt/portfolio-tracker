'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { getMyAiUsage, type AiUsageView } from '@/app/actions/aiUsage'
import {
  allowanceLeft,
  formatEstimatedUsd,
  type UsageTotals,
} from '@/lib/aiUsage/decide'
import { MONEY_MASK } from '@/lib/privacyMode'

type Range = 'window' | 'all'

function tokens(value: number, hide: boolean): string {
  if (hide) return MONEY_MASK
  return value.toLocaleString('en-US')
}

function dollars(value: number, hide: boolean): string {
  if (hide) return MONEY_MASK
  return formatEstimatedUsd(value)
}

function UsageLines({
  totals,
  hide,
}: {
  totals: UsageTotals
  hide: boolean
}) {
  return (
    <div className="space-y-0.5 text-xs text-foreground">
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Prompt tokens</span>
        <span className="tabular-nums">{tokens(totals.promptTokens, hide)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Completion tokens</span>
        <span className="tabular-nums">{tokens(totals.completionTokens, hide)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Estimated</span>
        <span className="tabular-nums">{dollars(totals.estimatedUsd, hide)}</span>
      </div>
    </div>
  )
}

/** Account-menu meter. Loads when the menu opens. Dollars stay USD. */
export default function AiUsageMenu({
  hideMoney,
  open,
}: {
  hideMoney: boolean
  open: boolean
}) {
  const [range, setRange] = useState<Range>('window')
  const [view, setView] = useState<AiUsageView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    void getMyAiUsage().then((result) => {
      if (result.error || !result.data) {
        setError(result.error ?? 'AI usage could not be checked.')
        setView(null)
      } else {
        setError(null)
        setView(result.data)
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, load])

  const totals = view
    ? range === 'window'
      ? view.window
      : view.allTime
    : null
  const evalTotals = view
    ? range === 'window'
      ? view.evalWindow
      : view.evalAllTime
    : null
  const left =
    view && range === 'window'
      ? allowanceLeft(view.allowanceUsd, view.window.estimatedUsd)
      : null

  return (
    <div
      className="px-3 py-2"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          AI usage (estimated, USD)
        </span>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={load}
        >
          Refresh
        </button>
      </div>
      <div className="mb-2 flex gap-1">
        <button
          type="button"
          className={`rounded px-2 py-0.5 text-xs ${range === 'window' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setRange('window')}
        >
          This period
        </button>
        <button
          type="button"
          className={`rounded px-2 py-0.5 text-xs ${range === 'all' ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setRange('all')}
        >
          All time
        </button>
      </div>
      {loading && !view && (
        <p className="text-xs text-muted-foreground">Loading usage…</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {view && totals && (
        <>
          <UsageLines totals={totals} hide={hideMoney} />
          {range === 'window' && left && (
            <div className="mt-1.5 space-y-0.5 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Allowance</span>
                <span className="tabular-nums">{dollars(view.allowanceUsd, hideMoney)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Left</span>
                <span className="tabular-nums">{dollars(left.leftUsd, hideMoney)}</span>
              </div>
              {left.overUsd > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Over</span>
                  <span className="tabular-nums">{dollars(left.overUsd, hideMoney)}</span>
                </div>
              )}
              <p className="pt-1 text-muted-foreground">
                Resets {format(new Date(view.periodEndsAt), 'd MMM yyyy HH:mm')}
              </p>
            </div>
          )}
          {view.isAdmin && evalTotals && (
            <div className="mt-1.5 flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Eval (estimated)</span>
              <span className="tabular-nums">{dollars(evalTotals.estimatedUsd, hideMoney)}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
