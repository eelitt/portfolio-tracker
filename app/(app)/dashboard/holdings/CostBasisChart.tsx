'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/currency'
import {
  colorForSeriesIndex,
  type SnapshotPoint,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import type { PreferredCurrency } from '@/lib/userTypes'
import { useHideMoney } from '@/app/(app)/privacy/PrivacyModeProvider'
import { MONEY_MASK } from '@/lib/privacyMode'

const MARKET_COLOR = colorForSeriesIndex(0)
const COST_COLOR = colorForSeriesIndex(1)

function formatTick(date: string, mode: SnapshotRangeMode): string {
  const [y, m, d] = date.split('-').map(Number)
  if (mode === 'yearly') return String(y)
  if (mode === 'monthly') {
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    })
  }
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function money(amount: number, currency: PreferredCurrency, hideMoney: boolean) {
  if (hideMoney) return MONEY_MASK
  return formatCurrency(amount, currency, 1)
}

export default function CostBasisChart({
  points,
  rangeMode,
  preferredCurrency,
}: {
  points: SnapshotPoint[]
  rangeMode: SnapshotRangeMode
  preferredCurrency: PreferredCurrency
}) {
  const hideMoney = useHideMoney()
  const rows = points.map((point) => ({
    date: point.date,
    label: formatTick(point.date, rangeMode),
    marketValue: point.marketValue,
    costBasis: point.costBasis,
    isPartial: point.isPartial,
  }))

  return (
    <div>
      <div className="mt-2 h-80 w-full min-w-0">
        <ResponsiveContainer
          width="100%"
          height={320}
          initialDimension={{ width: 640, height: 320 }}
        >
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              tickFormatter={(value) => {
                if (hideMoney) return MONEY_MASK
                return formatCurrency(Number(value), preferredCurrency, 1).replace(
                  /[^\d.,\s-]/g,
                  ''
                )
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as (typeof rows)[number] | undefined
                if (!row) return null
                const gap = row.marketValue - row.costBasis
                return (
                  <div className="max-w-xs rounded-md border bg-card px-3 py-2 text-sm shadow-md">
                    <div className="mb-1 font-medium">{row.date}</div>
                    <ul className="space-y-0.5">
                      <li className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: MARKET_COLOR }}
                          />
                          Market value
                        </span>
                        <span className="tabular-nums">
                          {money(row.marketValue, preferredCurrency, hideMoney)}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: COST_COLOR }}
                          />
                          Cost basis
                        </span>
                        <span className="tabular-nums">
                          {money(row.costBasis, preferredCurrency, hideMoney)}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Gap</span>
                        <span className="tabular-nums">
                          {money(gap, preferredCurrency, hideMoney)}
                        </span>
                      </li>
                    </ul>
                    {row.isPartial ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Unpriced name left out of both lines.
                      </p>
                    ) : null}
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="marketValue"
              name="Market value"
              stroke={MARKET_COLOR}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="costBasis"
              name="Cost basis"
              stroke={COST_COLOR}
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: MARKET_COLOR }}
          />
          Market value
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: COST_COLOR }}
          />
          Cost basis, if this capital had stayed cash
        </span>
      </div>
    </div>
  )
}
