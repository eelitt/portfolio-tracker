'use client'

/**
 * AllocationPie
 *
 * Donut chart of portfolio allocation by market value.
 * Legend + center total (no on-slice labels). Tiny positions roll into "Other".
 */

import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/currency'
import SensitiveValue from '@/components/SensitiveValue'
import { usePrivacyMode } from '@/app/(app)/privacy/PrivacyModeProvider'
import { MONEY_MASK } from '@/lib/privacyMode'
import type { PreferredCurrency } from '@/lib/userTypes'

interface AllocationPieProps {
  enrichedHoldings: Array<{
    symbol: string
    marketValue: number
  }>
  preferredCurrency?: PreferredCurrency
  usdToPreferredRate?: number
}

type Slice = {
  name: string
  value: number
  percent: number
  color: string
}

/** Distinct, finance-friendly palette (works on light/dark card). */
const COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#f43f5e', // rose
  '#84cc16', // lime
  '#8b5cf6', // violet
]

const OTHER_COLOR = '#94a3b8'
const MAX_NAMED_SLICES = 7
const MIN_SLICE_PCT = 0.025 // roll into Other below 2.5%

function buildSlices(
  holdings: Array<{ symbol: string; marketValue: number }>
): Slice[] {
  const positive = holdings
    .filter((h) => h.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue)

  const total = positive.reduce((s, h) => s + h.marketValue, 0)
  if (total <= 0) return []

  const named: typeof positive = []
  let otherValue = 0

  for (let i = 0; i < positive.length; i++) {
    const h = positive[i]
    const pct = h.marketValue / total
    if (named.length < MAX_NAMED_SLICES && pct >= MIN_SLICE_PCT) {
      named.push(h)
    } else {
      otherValue += h.marketValue
    }
  }

  const slices: Slice[] = named.map((h, i) => ({
    name: h.symbol,
    value: h.marketValue,
    percent: h.marketValue / total,
    color: COLORS[i % COLORS.length],
  }))

  if (otherValue > 0) {
    slices.push({
      name: 'Other',
      value: otherValue,
      percent: otherValue / total,
      color: OTHER_COLOR,
    })
  }

  return slices
}

export default function AllocationPie({
  enrichedHoldings,
  preferredCurrency,
}: AllocationPieProps) {
  const currency = preferredCurrency || 'USD'
  const { hideMoney } = usePrivacyMode()
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  const slices = useMemo(
    () => buildSlices(enrichedHoldings || []),
    [enrichedHoldings]
  )

  const total = useMemo(
    () => slices.reduce((s, x) => s + x.value, 0),
    [slices]
  )

  if (slices.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No allocation data available.
        <br />
        <span className="text-sm">
          Live prices may be temporarily unavailable.
        </span>
      </div>
    )
  }

  // Outer card chrome lives on HoldingsChartsPanel
  return (
    <div className="relative z-0 overflow-visible">
      {/* Pie + legend: legend wide enough for names like "Emergency Fund" */}
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] md:items-center lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        {/* Donut + center total */}
        <div className="relative z-10 mx-auto h-72 w-full max-w-sm overflow-visible">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={104}
                paddingAngle={2}
                stroke="hsl(var(--card))"
                strokeWidth={2}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(undefined)}
                isAnimationActive={false}
              >
                {slices.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={
                      activeIndex === undefined || activeIndex === i ? 1 : 0.4
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 50, outline: 'none' }}
                contentStyle={{ zIndex: 50 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null
                  const p = payload[0].payload as Slice
                  return (
                    <div className="relative z-50 rounded-md border bg-card px-3 py-2 text-sm shadow-lg">
                      <div className="font-medium">{p.name}</div>
                      <div>
                        {hideMoney
                          ? MONEY_MASK
                          : formatCurrency(p.value, currency, 1)}
                      </div>
                      <div className="text-muted-foreground">
                        {(p.percent * 100).toFixed(1)}% of portfolio
                      </div>
                    </div>
                  )
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-base font-semibold tabular-nums sm:text-lg">
              <SensitiveValue value={formatCurrency(total, currency, 1)} />
            </span>
          </div>
        </div>

        {/* Legend — readable names on desktop without feeling huge */}
        <ul className="z-0 flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          {slices.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted/60"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(undefined)}
                onFocus={() => setActiveIndex(i)}
                onBlur={() => setActiveIndex(undefined)}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 font-medium leading-snug break-words">
                  {s.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {(s.percent * 100).toFixed(1)}%
                </span>
                <span className="w-[5.25rem] shrink-0 text-right tabular-nums">
                  <SensitiveValue value={formatCurrency(s.value, currency, 1)} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
