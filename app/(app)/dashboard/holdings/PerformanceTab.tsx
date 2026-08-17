'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import PerformanceChart, { buildSeriesMeta } from './PerformanceChart'
import PerformanceMetrics from './PerformanceMetrics'
import ContributionTable from './ContributionTable'
import {
  aggregateSnapshotSeries,
  holdingSeriesId,
  PORTFOLIO_SERIES_ID,
  type PerformanceScaleMode,
  type SnapshotPoint,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import {
  BENCHMARK_PRESETS,
  benchmarkSeriesId,
  contributionFromDeltas,
  seriesDelta,
  type BenchmarkId,
} from '@/lib/benchmarks'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EnrichedHolding } from '@/lib/types'
import type { CashFlow } from '@/lib/performance'
import { getHoldingSnapshotsBatch } from '@/app/actions/snapshots'
import { getBenchmarkSeries } from '@/app/actions/benchmarks'
import { cn } from '@/lib/utils'
import { CircleHelp } from 'lucide-react'
import { SectionIconPopover } from '@/components/ui/section-icon-popover'
import {
  readBenchIds,
  readVisibleSet,
  writeBenchIds,
  writeVisibleSet,
} from './chartPrefs'

export default function PerformanceTab({
  enrichedHoldings,
  preferredCurrency,
  snapshots,
  snapshotsError,
  cashFlows,
  rangeMode,
  scaleMode,
  onScaleChange,
  active,
}: {
  enrichedHoldings: EnrichedHolding[]
  preferredCurrency: PreferredCurrency
  snapshots: SnapshotPoint[]
  snapshotsError?: string | null
  cashFlows: CashFlow[]
  rangeMode: SnapshotRangeMode
  scaleMode: PerformanceScaleMode
  onScaleChange: (mode: PerformanceScaleMode) => void
  active: boolean
}) {
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set([PORTFOLIO_SERIES_ID])
  )
  const [holdingSeries, setHoldingSeries] = useState<
    Record<string, SnapshotPoint[]>
  >({})
  const [holdingError, setHoldingError] = useState<string | null>(null)
  const [holdingLoading, setHoldingLoading] = useState(false)
  const [benchOn, setBenchOn] = useState<Set<BenchmarkId>>(() => new Set())
  const [benchSeries, setBenchSeries] = useState<Record<string, SnapshotPoint[]>>(
    {}
  )
  const [benchError, setBenchError] = useState<string | null>(null)
  const [benchLoading, setBenchLoading] = useState(false)

  const legendHoldings = useMemo(() => {
    const assets = enrichedHoldings
      .filter((h) => h.asset_type !== 'cash')
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
    const cash = enrichedHoldings
      .filter((h) => h.asset_type === 'cash')
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
    return [...assets, ...cash].map((h) => ({
      id: holdingSeriesId(h.asset_type, h.symbol),
      label: h.asset_type === 'cash' ? `${h.symbol}` : h.symbol,
      assetType: h.asset_type,
      symbol: h.symbol,
    }))
  }, [enrichedHoldings])

  const seriesMeta = useMemo(() => {
    const holdings = buildSeriesMeta(
      legendHoldings.map((h) => ({ id: h.id, label: h.label }))
    )
    const benches = BENCHMARK_PRESETS.map((p) => ({
      id: benchmarkSeriesId(p.id),
      label: p.shortLabel,
      color: p.color,
      dashed: true as const,
    }))
    return [...holdings, ...benches]
  }, [legendHoldings])

  useEffect(() => {
    setVisible(readVisibleSet([PORTFOLIO_SERIES_ID]))
    setBenchOn(readBenchIds())
  }, [])

  useEffect(() => {
    if (!active) return
    if (legendHoldings.length === 0) {
      setHoldingSeries({})
      setHoldingError(null)
      setHoldingLoading(false)
      return
    }

    let cancelled = false
    setHoldingLoading(true)
    setHoldingError(null)

    void getHoldingSnapshotsBatch(
      legendHoldings.map((h) => ({
        symbol: h.symbol,
        assetType: h.assetType as 'stock' | 'etf' | 'crypto' | 'cash',
      }))
    ).then((result) => {
      if (cancelled) return
      setHoldingLoading(false)
      if (result.error) {
        setHoldingError(result.error)
        setHoldingSeries({})
        return
      }
      setHoldingSeries(result.data ?? {})
    })

    return () => {
      cancelled = true
    }
  }, [active, legendHoldings])

  useEffect(() => {
    if (!active) return
    const needed = [...benchOn].filter(
      (id) => !benchSeries[benchmarkSeriesId(id)]
    )
    if (needed.length === 0) return

    let cancelled = false
    setBenchLoading(true)
    setBenchError(null)
    void getBenchmarkSeries(needed).then((result) => {
      if (cancelled) return
      setBenchLoading(false)
      if (result.error) {
        setBenchError(result.error)
        return
      }
      setBenchSeries((prev) => ({ ...prev, ...(result.data ?? {}) }))
    })

    return () => {
      cancelled = true
    }
  }, [active, benchOn, benchSeries])

  const seriesById = useMemo(
    () => ({
      [PORTFOLIO_SERIES_ID]: snapshots,
      ...holdingSeries,
      ...benchSeries,
    }),
    [snapshots, holdingSeries, benchSeries]
  )

  const visibleIds = useMemo(() => {
    const ids = [...visible]
    for (const id of benchOn) ids.push(benchmarkSeriesId(id))
    return ids
  }, [visible, benchOn])

  const contributionRows = useMemo(() => {
    const portWin = aggregateSnapshotSeries(snapshots, rangeMode)
    const portDelta = seriesDelta(portWin)
    if (portDelta == null) return []
    const inputs = legendHoldings.flatMap((h) => {
      const raw = holdingSeries[h.id]
      if (!raw || raw.length < 2) return []
      const delta = seriesDelta(aggregateSnapshotSeries(raw, rangeMode))
      if (delta == null) return []
      return [{ id: h.id, label: h.label, delta }]
    })
    return contributionFromDeltas(portDelta, inputs)
  }, [snapshots, holdingSeries, legendHoldings, rangeMode])

  const onToggleSeries = useCallback((id: string) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeVisibleSet(next)
      return next
    })
  }, [])

  const setAllAssets = useCallback(
    (on: boolean) => {
      setVisible((prev) => {
        const next = new Set(prev)
        for (const h of legendHoldings) {
          if (h.assetType === 'cash') {
            if (!on) next.delete(h.id)
            continue
          }
          if (on) next.add(h.id)
          else next.delete(h.id)
        }
        if (!next.has(PORTFOLIO_SERIES_ID) && next.size === 0) {
          next.add(PORTFOLIO_SERIES_ID)
        }
        writeVisibleSet(next)
        return next
      })
    },
    [legendHoldings]
  )

  const onToggleBench = useCallback(
    (id: BenchmarkId) => {
      setBenchOn((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
          if (prev.size === 0 && scaleMode === 'absolute') {
            onScaleChange('indexed')
          }
        }
        writeBenchIds(next)
        return next
      })
    },
    [scaleMode, onScaleChange]
  )

  const performanceWarning =
    [holdingError, benchError].filter(Boolean).join(' · ') || null

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Benchmarks</span>
          {BENCHMARK_PRESETS.map((p) => {
            const on = benchOn.has(p.id)
            const sid = benchmarkSeriesId(p.id)
            const hasData = (benchSeries[sid]?.length ?? 0) > 0
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggleBench(p.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  on
                    ? 'border-border bg-muted/60 text-foreground'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/40'
                )}
                title={on ? `Hide ${p.label}` : `Compare to ${p.label}`}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: on ? p.color : 'transparent',
                    boxShadow: on ? undefined : `inset 0 0 0 1px ${p.color}`,
                  }}
                />
                {p.shortLabel}
                {on && benchLoading && !hasData ? (
                  <span className="text-muted-foreground">…</span>
                ) : null}
              </button>
            )
          })}
        </div>
        <SectionIconPopover
          label="Performance terms"
          title="How to read this chart"
          icon={<CircleHelp className="h-4 w-4" />}
          className="shrink-0"
          panelClassName="right-0 left-auto w-[min(20rem,calc(100vw-2rem))]"
        >
          <ul className="list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">
                Portfolio change
              </span>
              {' — '}
              Change in snapshot market value in this range. Cash in or out
              moves this number.
            </li>
            <li>
              <span className="font-medium text-foreground">Indexed %</span>
              {' — '}
              Each visible line is rebased to 0% at the start of the range so
              unlike sizes can be compared.
            </li>
            <li>
              <span className="font-medium text-foreground">TWR</span>
              {' — '}
              Time-weighted return. Cash in/out is treated as a flow, not
              profit or loss. Uses end-of-day snapshots, not a perfect NAV.
            </li>
            <li>
              <span className="font-medium text-foreground">Vol · pp daily</span>
              {' — '}
              How much daily TWR wiggles, in percentage points. Ann. is that
              figure × √365 when there are at least 30 days.
            </li>
            <li>
              <span className="font-medium text-foreground">Max DD</span>
              {' — '}
              Worst peak-to-trough drop on the TWR index in this range.
            </li>
            <li>
              <span className="font-medium text-foreground">Excess</span>
              {' — '}
              TWR minus the benchmark’s price return. Not alpha. Dashed lines
              are price paths, not something you hold.
            </li>
            <li>
              <span className="font-medium text-foreground">TE</span>
              {' — '}
              Tracking error: how much daily book value wanders versus the
              bench price.
            </li>
            <li>
              <span className="font-medium text-foreground">Contribution</span>
              {' — '}
              Share of the book’s market-value change, not TWR. Cash in/out
              counts.
            </li>
          </ul>
        </SectionIconPopover>
      </div>
      <PerformanceMetrics
        seriesById={seriesById}
        seriesMeta={seriesMeta}
        visibleIds={visibleIds}
        rangeMode={rangeMode}
        scaleMode={scaleMode}
        preferredCurrency={preferredCurrency}
        warning={performanceWarning}
        cashFlows={cashFlows}
      />
      <PerformanceChart
        seriesById={seriesById}
        seriesMeta={seriesMeta}
        visibleIds={visibleIds}
        onToggleSeries={onToggleSeries}
        rangeMode={rangeMode}
        scaleMode={scaleMode}
        preferredCurrency={preferredCurrency}
        error={snapshotsError}
        loading={
          holdingLoading &&
          snapshots.length === 0 &&
          legendHoldings.length > 0
        }
      />
      {holdingLoading && snapshots.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Loading holding history…
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <button
          type="button"
          className="underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setAllAssets(true)}
        >
          All assets
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          className="underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setAllAssets(false)}
        >
          None
        </button>
        <span className="text-muted-foreground/80">
          (click chips to show/hide · cash off by default)
        </span>
      </div>
      <ContributionTable
        rows={contributionRows}
        preferredCurrency={preferredCurrency}
      />
    </>
  )
}
