'use client'

/**
 * Portfolio overview chart switcher under the holdings grid.
 *
 * Three views in one card (no separate routes):
 * - Allocation  — pie of current positions
 * - Performance — portfolio value history from daily snapshots
 * - Price       — per-holding OHLC + buy/sell markers (lazy-loads history)
 *
 * Main tabs + Performance range chips use SegmentedControl so they read as
 * view switchers, not primary action buttons.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  /** Pre-loaded portfolio_snapshots series for the Performance tab */
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
    <Card className="mb-10 mt-5">
      <CardHeader className="shadow-sm pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-xl font-semibold">Portfolio overview</CardTitle>
          <SegmentedControl
            aria-label="Portfolio chart view"
            options={MAIN_TABS}
            value={tab}
            onChange={setTab}
          />
        </div>

        {/* Performance-only: snapshot aggregation granularity */}
        {tab === 'performance' && (
          <div className="mt-3">
            <SegmentedControl
              aria-label="Performance time aggregation"
              size="sm"
              options={PERF_RANGES}
              value={rangeMode}
              onChange={setRangeMode}
            />
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-4">
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
          // Mounts only when active → history fetch starts when user opens Price
          <PriceChartTab
            holdings={enrichedHoldings}
            preferredCurrency={preferredCurrency}
          />
        )}
      </CardContent>
    </Card>
  )
}
