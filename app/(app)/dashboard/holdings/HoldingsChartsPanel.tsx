'use client'

/**
 * Charts section: Allocation | Performance | Price.
 * Performance: multi-series with legend toggles (no per-holding dropdown).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import AllocationPie from './AllocationPie'
import PerformanceChart, { buildSeriesMeta } from './PerformanceChart'
import PriceChartTab from './PriceChartTab'
import ContributionTable from './ContributionTable'
import { SegmentedControl } from './SegmentedControl'
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
import { getHoldingSnapshotsBatch } from '@/app/actions/snapshots'
import { getBenchmarkSeries } from '@/app/actions/benchmarks'
import { cn } from '@/lib/utils'

type ChartTab = 'allocation' | 'performance' | 'price'

const MAIN_TABS: { value: ChartTab; label: string }[] = [
  { value: 'allocation', label: 'Allocation' },
  { value: 'performance', label: 'Performance' },
  { value: 'price', label: 'Price' },
]

const PERF_RANGES: { value: SnapshotRangeMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const PERF_SCALE: { value: PerformanceScaleMode; label: string }[] = [
  { value: 'absolute', label: 'Absolute' },
  { value: 'indexed', label: 'Indexed %' },
]

const LS_VISIBLE = 'perfChartVisibleSeries'
const LS_SCALE = 'perfChartScaleMode'
const LS_BENCH = 'perfChartBenchmarks'
const LS_TAB = 'chartsTab'

function readVisibleSet(defaultOn: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(LS_VISIBLE)
    if (!raw) return new Set(defaultOn)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(defaultOn)
    return new Set(parsed.filter((x) => typeof x === 'string'))
  } catch {
    return new Set(defaultOn)
  }
}

function writeVisibleSet(ids: Set<string>) {
  try {
    localStorage.setItem(LS_VISIBLE, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

function readScaleMode(): PerformanceScaleMode {
  try {
    const v = localStorage.getItem(LS_SCALE)
    if (v === 'indexed' || v === 'absolute') return v
  } catch {
    // ignore
  }
  return 'absolute'
}

function readBenchIds(): Set<BenchmarkId> {
  try {
    const raw = localStorage.getItem(LS_BENCH)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    const allowed = new Set(BENCHMARK_PRESETS.map((p) => p.id))
    return new Set(
      parsed.filter((x): x is BenchmarkId => typeof x === 'string' && allowed.has(x as BenchmarkId))
    )
  } catch {
    return new Set()
  }
}

function writeBenchIds(ids: Set<BenchmarkId>) {
  try {
    localStorage.setItem(LS_BENCH, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

interface HoldingsChartsPanelProps {
  enrichedHoldings: EnrichedHolding[]
  preferredCurrency: PreferredCurrency
  usdToPreferredRate: number
  snapshots: SnapshotPoint[]
  snapshotsError?: string | null
}

export default function HoldingsChartsPanel({
  enrichedHoldings,
  preferredCurrency,
  usdToPreferredRate,
  snapshots,
  snapshotsError,
}: HoldingsChartsPanelProps) {
  const [tab, setTab] = useState<ChartTab>('allocation')
  const [rangeMode, setRangeMode] = useState<SnapshotRangeMode>('daily')
  const [scaleMode, setScaleMode] = useState<PerformanceScaleMode>('absolute')
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
  const [priceVisited, setPriceVisited] = useState(false)

  const legendHoldings = useMemo(() => {
    // Cash off by default and listed last; assets first alphabetically
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

  // Load persisted prefs after mount (avoid SSR localStorage)
  useEffect(() => {
    setVisible(readVisibleSet([PORTFOLIO_SERIES_ID]))
    setScaleMode(readScaleMode())
    setBenchOn(readBenchIds())
    try {
      const stored = localStorage.getItem(LS_TAB)
      if (
        stored === 'allocation' ||
        stored === 'performance' ||
        stored === 'price'
      ) {
        setTab(stored)
        if (stored === 'price') setPriceVisited(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const onTabChange = useCallback((next: ChartTab) => {
    setTab(next)
    if (next === 'price') setPriceVisited(true)
    try {
      localStorage.setItem(LS_TAB, next)
    } catch {
      // ignore
    }
  }, [])

  // Lazy-load all holding series when Performance tab opens
  useEffect(() => {
    if (tab !== 'performance') return
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
  }, [tab, legendHoldings])

  // Lazy-load only newly enabled benches (session cache in benchSeries)
  useEffect(() => {
    if (tab !== 'performance') return
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
  }, [tab, benchOn, benchSeries])

  const seriesById = useMemo(() => {
    const map: Record<string, SnapshotPoint[]> = {
      [PORTFOLIO_SERIES_ID]: snapshots,
      ...holdingSeries,
      ...benchSeries,
    }
    return map
  }, [snapshots, holdingSeries, benchSeries])

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
        // Keep portfolio as-is; toggle only asset holdings (not cash unless on)
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

  const onScaleChange = useCallback((mode: PerformanceScaleMode) => {
    setScaleMode(mode)
    try {
      localStorage.setItem(LS_SCALE, mode)
    } catch {
      // ignore
    }
  }, [])

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

  const performanceWarning = [holdingError, benchError].filter(Boolean).join(' · ') || null

  return (
    <section className="mb-8">
      <h2 className="section-title mb-4">
        <span className="section-title-accent">Charts</span>
      </h2>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          {tab === 'performance' ? (
            <>
              <SegmentedControl
                aria-label="Performance time aggregation"
                size="sm"
                options={PERF_RANGES}
                value={rangeMode}
                onChange={setRangeMode}
              />
              <SegmentedControl
                aria-label="Performance scale"
                size="sm"
                options={PERF_SCALE}
                value={scaleMode}
                onChange={onScaleChange}
              />
              <span className="text-[11px] text-muted-foreground">
                Groups snapshot dates — not the same as Price 1M / 3M / 1Y.
              </span>
            </>
          ) : null}
        </div>
        <SegmentedControl
          aria-label="Chart view"
          size="sm"
          options={MAIN_TABS}
          value={tab}
          onChange={onTabChange}
        />
      </div>

      <div className="rounded-xl border border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5">
        <div hidden={tab !== 'allocation'}>
          <AllocationPie
            enrichedHoldings={enrichedHoldings}
            preferredCurrency={preferredCurrency}
            usdToPreferredRate={usdToPreferredRate}
          />
        </div>
        <div hidden={tab !== 'performance'}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                Benchmarks
              </span>
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
                    title={
                      on
                        ? `Hide ${p.label}`
                        : `Compare to ${p.label}`
                    }
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
            <PerformanceChart
              seriesById={seriesById}
              seriesMeta={seriesMeta}
              visibleIds={visibleIds}
              onToggleSeries={onToggleSeries}
              rangeMode={rangeMode}
              scaleMode={scaleMode}
              preferredCurrency={preferredCurrency}
              error={snapshotsError}
              warning={performanceWarning}
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
        </div>
        {priceVisited ? (
          <div hidden={tab !== 'price'}>
            <PriceChartTab
              holdings={enrichedHoldings}
              preferredCurrency={preferredCurrency}
            />
          </div>
        ) : null}
      </div>
    </section>
  )
}
