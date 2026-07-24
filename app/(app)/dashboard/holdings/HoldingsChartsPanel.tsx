'use client'

/**
 * Open Charts section (like Summary/Holdings): title + tabs, then elevated chart body.
 */

import { useState } from 'react'
import AllocationPie from './AllocationPie'
import PerformanceChart from './PerformanceChart'
import PriceChartTab from './PriceChartTab'
import { SegmentedControl } from './SegmentedControl'
import type { SnapshotPoint, SnapshotRangeMode } from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EnrichedHolding } from '@/lib/types'

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

  return (
    <section className="mb-8">
      <h2 className="section-title mb-4">
        <span className="section-title-accent">Charts</span>
      </h2>

      {/* Same row: range left, chart type right (aligned with chart panel below) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-h-8">
          {tab === 'performance' ? (
            <SegmentedControl
              aria-label="Performance time aggregation"
              size="sm"
              options={PERF_RANGES}
              value={rangeMode}
              onChange={setRangeMode}
            />
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
          <PerformanceChart
            points={snapshots}
            rangeMode={rangeMode}
            preferredCurrency={preferredCurrency}
            error={snapshotsError}
          />
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
