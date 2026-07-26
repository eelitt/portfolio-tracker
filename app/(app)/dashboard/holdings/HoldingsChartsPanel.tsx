'use client'

/**
 * Open Charts section (like Summary/Holdings): title + tabs, then elevated chart body.
 */

import { useEffect, useMemo, useState } from 'react'
import AllocationPie from './AllocationPie'
import PerformanceChart from './PerformanceChart'
import PriceChartTab from './PriceChartTab'
import { SegmentedControl } from './SegmentedControl'
import type { SnapshotPoint, SnapshotRangeMode } from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EnrichedHolding } from '@/lib/types'
import { getHoldingSnapshots } from '@/app/actions/snapshots'
import { fieldClassName } from '../transactions/formStyles'

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

const PORTFOLIO_SERIES = 'portfolio'

type SeriesKey = typeof PORTFOLIO_SERIES | string // holding: assetType:symbol

function holdingSeriesKey(h: Pick<EnrichedHolding, 'symbol' | 'asset_type'>): string {
  return `${h.asset_type}:${h.symbol}`
}

function parseHoldingSeriesKey(
  key: string
): { symbol: string; assetType: EnrichedHolding['asset_type'] } | null {
  const idx = key.indexOf(':')
  if (idx <= 0) return null
  const assetType = key.slice(0, idx) as EnrichedHolding['asset_type']
  const symbol = key.slice(idx + 1)
  if (!symbol) return null
  if (!['stock', 'etf', 'crypto', 'cash'].includes(assetType)) return null
  return { symbol, assetType }
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
  const [seriesKey, setSeriesKey] = useState<SeriesKey>(PORTFOLIO_SERIES)
  const [holdingPoints, setHoldingPoints] = useState<SnapshotPoint[] | null>(null)
  const [holdingError, setHoldingError] = useState<string | null>(null)
  const [holdingLoading, setHoldingLoading] = useState(false)

  const seriesOptions = useMemo(() => {
    const open = [...enrichedHoldings].sort((a, b) =>
      a.symbol.localeCompare(b.symbol)
    )
    return open
  }, [enrichedHoldings])

  useEffect(() => {
    if (tab !== 'performance' || seriesKey === PORTFOLIO_SERIES) {
      setHoldingPoints(null)
      setHoldingError(null)
      setHoldingLoading(false)
      return
    }

    const parsed = parseHoldingSeriesKey(seriesKey)
    if (!parsed) {
      setHoldingError('Invalid holding selection.')
      setHoldingPoints(null)
      return
    }

    let cancelled = false
    setHoldingLoading(true)
    setHoldingError(null)

    void getHoldingSnapshots({
      symbol: parsed.symbol,
      assetType: parsed.assetType,
    }).then((result) => {
      if (cancelled) return
      setHoldingLoading(false)
      if (result.error) {
        setHoldingError(result.error)
        setHoldingPoints(null)
        return
      }
      setHoldingPoints(result.data ?? [])
    })

    return () => {
      cancelled = true
    }
  }, [tab, seriesKey])

  const performancePoints =
    seriesKey === PORTFOLIO_SERIES ? snapshots : holdingPoints ?? []
  const performanceError =
    seriesKey === PORTFOLIO_SERIES
      ? snapshotsError
      : holdingError
  const seriesLabel =
    seriesKey === PORTFOLIO_SERIES
      ? 'Portfolio'
      : parseHoldingSeriesKey(seriesKey)?.symbol ?? 'Holding'

  return (
    <section className="mb-8">
      <h2 className="section-title mb-4">
        <span className="section-title-accent">Charts</span>
      </h2>

      {/* Same row: range left, chart type right (aligned with chart panel below) */}
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
              <label className="sr-only" htmlFor="perf-series">
                Performance series
              </label>
              <select
                id="perf-series"
                value={seriesKey}
                onChange={(e) => setSeriesKey(e.target.value)}
                className={`${fieldClassName} h-8 w-auto min-w-[9rem] max-w-[14rem] py-0 text-xs`}
                aria-label="Performance series"
              >
                <option value={PORTFOLIO_SERIES}>Portfolio</option>
                {seriesOptions.map((h) => (
                  <option key={holdingSeriesKey(h)} value={holdingSeriesKey(h)}>
                    {h.symbol}
                    {h.asset_type === 'cash' ? ' (cash)' : ''}
                  </option>
                ))}
              </select>
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

      {/* Content panel — elevated so chart UI separates from page field */}
      <div className="rounded-xl border border-subtle bg-surface-elevated p-4 shadow-sm sm:p-5">
        {tab === 'allocation' ? (
          <AllocationPie
            enrichedHoldings={enrichedHoldings}
            preferredCurrency={preferredCurrency}
            usdToPreferredRate={usdToPreferredRate}
          />
        ) : tab === 'performance' ? (
          holdingLoading && seriesKey !== PORTFOLIO_SERIES ? (
            <div className="empty-state h-80">
              <p className="text-muted-foreground">Loading {seriesLabel} history…</p>
            </div>
          ) : (
            <PerformanceChart
              points={performancePoints}
              rangeMode={rangeMode}
              preferredCurrency={preferredCurrency}
              error={performanceError}
              seriesLabel={seriesLabel}
            />
          )
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
