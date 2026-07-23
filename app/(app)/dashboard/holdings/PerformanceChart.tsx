'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/currency'
import {
  aggregateSnapshotSeries,
  seriesRangeChange,
  type SnapshotPoint,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'
import SensitiveValue from '@/components/SensitiveValue'
import { usePrivacyMode } from '@/app/(app)/privacy/PrivacyModeProvider'
import { MONEY_MASK } from '@/lib/privacyMode'

interface PerformanceChartProps {
  points: SnapshotPoint[]
  rangeMode: SnapshotRangeMode
  preferredCurrency: PreferredCurrency
  error?: string | null
}

function formatTick(date: string, mode: SnapshotRangeMode): string {
  const [y, m, d] = date.split('-').map(Number)
  if (mode === 'yearly') return String(y)
  if (mode === 'monthly') {
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    })
    return label
  }
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default function PerformanceChart({
  points,
  rangeMode,
  preferredCurrency,
  error,
}: PerformanceChartProps) {
  const { hideMoney } = usePrivacyMode()

  if (error) {
    return (
      <div className="bg-card border rounded-lg p-6 h-80 flex items-center justify-center text-center text-sm text-muted-foreground">
        {error}
      </div>
    )
  }

  if (!points.length) {
    return (
      <div className="bg-card border rounded-lg p-6 h-80 flex items-center justify-center text-center text-muted-foreground">
        <div>
          <p>No performance history yet.</p>
          <p className="text-sm mt-1">
            The chart builds as daily portfolio snapshots are recorded.
          </p>
        </div>
      </div>
    )
  }

  const series = aggregateSnapshotSeries(points, rangeMode)
  const change = seriesRangeChange(series)

  if (!series.length) {
    return (
      <div className="bg-card border rounded-lg p-6 h-80 flex items-center justify-center text-center text-muted-foreground">
        No data in this range.
      </div>
    )
  }

  const chartData = series.map((p) => ({
    ...p,
    label: formatTick(p.date, rangeMode),
  }))

  return (
    <div className="bg-card border rounded-lg p-6">
      {change && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Change in range</span>
          <span
            className={
              change.absolute >= 0 ? 'font-medium text-green-600' : 'font-medium text-red-600'
            }
          >
            <SensitiveValue
              value={formatCurrency(change.absolute, preferredCurrency, 1)}
            />{' '}
            ({change.percent >= 0 ? '+' : ''}
            {change.percent.toFixed(2)}%)
          </span>
        </div>
      )}

      {series.length === 1 && (
        <p className="mb-2 text-xs text-muted-foreground">
          Only one snapshot in this range — need more days for a trend.
        </p>
      )}

      <div className="h-80 w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mvFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#64748b" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#64748b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              width={64}
              tickFormatter={(v) =>
                hideMoney
                  ? MONEY_MASK
                  : formatCurrency(Number(v), preferredCurrency, 1).replace(
                      /[^\d.,\s-]/g,
                      ''
                    )
              }
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null
                const p = payload[0].payload as SnapshotPoint & { label: string }
                return (
                  <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-md">
                    <div className="font-medium">{p.date}</div>
                    <div>
                      {hideMoney
                        ? MONEY_MASK
                        : formatCurrency(p.marketValue, preferredCurrency, 1)}
                    </div>
                    {p.isPartial && (
                      <div className="text-xs text-amber-600 mt-1">
                        Incomplete prices that day
                      </div>
                    )}
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="marketValue"
              stroke="#64748b"
              strokeWidth={2}
              fill="url(#mvFill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
