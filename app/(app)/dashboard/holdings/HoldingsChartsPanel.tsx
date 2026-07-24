'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import AllocationPie from './AllocationPie'
import PerformanceChart from './PerformanceChart'
import PriceChartTab from './PriceChartTab'
import type { SnapshotPoint, SnapshotRangeMode } from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { EnrichedHolding } from '@/lib/types'

type ChartTab = 'allocation' | 'performance' | 'price'

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
    <div className="mb-10 mt-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Portfolio overview</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === 'allocation' ? 'default' : 'outline'}
            onClick={() => setTab('allocation')}
          >
            Allocation
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === 'performance' ? 'default' : 'outline'}
            onClick={() => setTab('performance')}
          >
            Performance
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === 'price' ? 'default' : 'outline'}
            onClick={() => setTab('price')}
          >
            Price
          </Button>
        </div>
      </div>

      {tab === 'performance' && (
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ['daily', 'Daily'],
              ['monthly', 'Monthly'],
              ['yearly', 'Yearly'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={rangeMode === value ? 'default' : 'outline'}
              onClick={() => setRangeMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

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
  )
}
