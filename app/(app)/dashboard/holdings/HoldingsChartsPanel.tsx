'use client'

/**
 * Charts section shell: Allocation | Performance | Price.
 */

import { useCallback, useEffect, useState } from 'react'
import AllocationPie from './AllocationPie'
import PerformanceTab from './PerformanceTab'
import PriceChartTab from './PriceChartTab'
import { SegmentedControl } from './SegmentedControl'
import {
  type PerformanceScaleMode,
  type SnapshotPoint,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EnrichedHolding } from '@/lib/types'
import type { CashFlow } from '@/lib/performance'
import {
  readChartTab,
  readScaleMode,
  writeChartTab,
  writeScaleMode,
  type ChartTab,
} from './chartPrefs'

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

interface HoldingsChartsPanelProps {
  enrichedHoldings: EnrichedHolding[]
  preferredCurrency: PreferredCurrency
  usdToPreferredRate: number
  snapshots: SnapshotPoint[]
  snapshotsError?: string | null
  cashFlows?: CashFlow[]
}

export default function HoldingsChartsPanel({
  enrichedHoldings,
  preferredCurrency,
  usdToPreferredRate,
  snapshots,
  snapshotsError,
  cashFlows = [],
}: HoldingsChartsPanelProps) {
  const [tab, setTab] = useState<ChartTab>('allocation')
  const [rangeMode, setRangeMode] = useState<SnapshotRangeMode>('daily')
  const [scaleMode, setScaleMode] = useState<PerformanceScaleMode>('absolute')
  const [priceVisited, setPriceVisited] = useState(false)
  const [perfVisited, setPerfVisited] = useState(false)

  useEffect(() => {
    setScaleMode(readScaleMode())
    const stored = readChartTab()
    if (stored) {
      setTab(stored)
      if (stored === 'price') setPriceVisited(true)
      if (stored === 'performance') setPerfVisited(true)
    }
  }, [])

  const onTabChange = useCallback((next: ChartTab) => {
    setTab(next)
    if (next === 'price') setPriceVisited(true)
    if (next === 'performance') setPerfVisited(true)
    writeChartTab(next)
  }, [])

  const onScaleChange = useCallback((mode: PerformanceScaleMode) => {
    setScaleMode(mode)
    writeScaleMode(mode)
  }, [])

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
        {perfVisited ? (
          <div hidden={tab !== 'performance'}>
            <PerformanceTab
              enrichedHoldings={enrichedHoldings}
              preferredCurrency={preferredCurrency}
              snapshots={snapshots}
              snapshotsError={snapshotsError}
              cashFlows={cashFlows}
              rangeMode={rangeMode}
              scaleMode={scaleMode}
              onScaleChange={onScaleChange}
              active={tab === 'performance'}
            />
          </div>
        ) : null}
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
