'use client'

/**
 * Charts section: Allocation | Performance | Price.
 * Performance: multi-series with legend toggles (no per-holding dropdown).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import AllocationPie from './AllocationPie'
import PerformanceChart, { buildSeriesMeta } from './PerformanceChart'
import PriceChartTab from './PriceChartTab'
import { SegmentedControl } from './SegmentedControl'
import {
  holdingSeriesId,
  PORTFOLIO_SERIES_ID,
  type PerformanceScaleMode,
  type SnapshotPoint,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EnrichedHolding } from '@/lib/types'
import { getHoldingSnapshotsBatch } from '@/app/actions/snapshots'

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

  const seriesMeta = useMemo(
    () =>
      buildSeriesMeta(
        legendHoldings.map((h) => ({ id: h.id, label: h.label }))
      ),
    [legendHoldings]
  )

  // Load persisted prefs after mount (avoid SSR localStorage)
  useEffect(() => {
    setVisible(readVisibleSet([PORTFOLIO_SERIES_ID]))
    setScaleMode(readScaleMode())
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

  const seriesById = useMemo(() => {
    const map: Record<string, SnapshotPoint[]> = {
      [PORTFOLIO_SERIES_ID]: snapshots,
      ...holdingSeries,
    }
    return map
  }, [snapshots, holdingSeries])

  const visibleIds = useMemo(() => [...visible], [visible])

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

  const performanceError = snapshotsError || holdingError

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
            </>
          ) : null}
        </div>
        <SegmentedControl
          aria-label="Chart view"
          size="sm"
          options={MAIN_TABS}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="rounded-xl border border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5">
        {tab === 'allocation' ? (
          <AllocationPie
            enrichedHoldings={enrichedHoldings}
            preferredCurrency={preferredCurrency}
            usdToPreferredRate={usdToPreferredRate}
          />
        ) : tab === 'performance' ? (
          <>
            <PerformanceChart
              seriesById={seriesById}
              seriesMeta={seriesMeta}
              visibleIds={visibleIds}
              onToggleSeries={onToggleSeries}
              rangeMode={rangeMode}
              scaleMode={scaleMode}
              preferredCurrency={preferredCurrency}
              error={performanceError}
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
          </>
        ) : (
          <PriceChartTab
            holdings={enrichedHoldings}
            preferredCurrency={preferredCurrency}
          />
        )}
      </div>
    </section>
  )
}
