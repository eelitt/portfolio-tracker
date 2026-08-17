'use client'

/**
 * AllocationPie
 *
 * Donut of priced market value. Tiny holdings roll into Other.
 * Holding | Type toggle; hover/pin drives the center label.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/currency'
import SensitiveValue from '@/components/SensitiveValue'
import { useHideMoney } from '@/app/(app)/privacy/PrivacyModeProvider'
import { MONEY_MASK } from '@/lib/privacyMode'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { AssetType } from '@/lib/types'
import { colorForHoldingSymbol } from '@/lib/aggregateSnapshots'
import { catalogNameFor } from '@/lib/portfolioAnalyst'
import { getAssetTypeLabel } from '@/lib/utils'
import { SegmentedControl } from './SegmentedControl'

interface AllocationPieProps {
  enrichedHoldings: Array<{
    symbol: string
    marketValue: number
    asset_type?: AssetType
    priceAvailable?: boolean
  }>
  preferredCurrency?: PreferredCurrency
  usdToPreferredRate?: number
}

type SliceMode = 'holding' | 'type'

type Slice = {
  id: string
  name: string
  subtitle?: string
  value: number
  percent: number
  color: string
}

const OTHER_COLOR = '#94a3b8'
const MAX_NAMED_SLICES = 7
const MIN_SLICE_PCT = 0.025
const LS_MODE = 'allocPieMode'

const MODE_OPTIONS: { value: SliceMode; label: string }[] = [
  { value: 'holding', label: 'Holding' },
  { value: 'type', label: 'Type' },
]

function holdingLabel(h: {
  symbol: string
  asset_type?: AssetType
}): { name: string; subtitle?: string } {
  if (!h.asset_type || h.asset_type === 'cash') {
    return { name: h.symbol, subtitle: 'Cash' }
  }
  const full = catalogNameFor(h.symbol, h.asset_type)
  if (full && full.toUpperCase() !== h.symbol.toUpperCase()) {
    return { name: h.symbol, subtitle: full }
  }
  return { name: h.symbol }
}

function buildHoldingSlices(
  holdings: AllocationPieProps['enrichedHoldings']
): Slice[] {
  const positive = holdings
    .filter((h) => h.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue)

  const total = positive.reduce((s, h) => s + h.marketValue, 0)
  if (total <= 0) return []

  const named: typeof positive = []
  let otherValue = 0

  for (const h of positive) {
    const pct = h.marketValue / total
    if (named.length < MAX_NAMED_SLICES && pct >= MIN_SLICE_PCT) {
      named.push(h)
    } else {
      otherValue += h.marketValue
    }
  }

  const slices: Slice[] = named.map((h) => {
    const label = holdingLabel(h)
    return {
      id: `${h.asset_type ?? 'x'}:${h.symbol}`,
      name: label.name,
      subtitle: label.subtitle,
      value: h.marketValue,
      percent: h.marketValue / total,
      color: colorForHoldingSymbol(h.symbol),
    }
  })

  if (otherValue > 0) {
    slices.push({
      id: 'other',
      name: 'Other',
      value: otherValue,
      percent: otherValue / total,
      color: OTHER_COLOR,
    })
  }

  return slices
}

function buildTypeSlices(
  holdings: AllocationPieProps['enrichedHoldings']
): Slice[] {
  const byType = new Map<string, number>()
  for (const h of holdings) {
    if (!(h.marketValue > 0)) continue
    const t = h.asset_type ?? 'stock'
    byType.set(t, (byType.get(t) ?? 0) + h.marketValue)
  }
  const total = [...byType.values()].reduce((s, v) => s + v, 0)
  if (total <= 0) return []

  return [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, value]) => ({
      id: `type:${t}`,
      name: getAssetTypeLabel(t),
      value,
      percent: value / total,
      color: colorForHoldingSymbol(t.toUpperCase()),
    }))
}

export default function AllocationPie({
  enrichedHoldings,
  preferredCurrency,
}: AllocationPieProps) {
  const currency = preferredCurrency || 'USD'
  const hideMoney = useHideMoney()
  const rootRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<SliceMode>('holding')
  const [hoverIndex, setHoverIndex] = useState<number | undefined>(undefined)
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_MODE)
      if (v === 'holding' || v === 'type') setMode(v)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setPinnedIndex(null)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const onModeChange = (next: SliceMode) => {
    setMode(next)
    setPinnedIndex(null)
    setHoverIndex(undefined)
    try {
      localStorage.setItem(LS_MODE, next)
    } catch {
      // ignore
    }
  }

  const slices = useMemo(
    () =>
      mode === 'type'
        ? buildTypeSlices(enrichedHoldings || [])
        : buildHoldingSlices(enrichedHoldings || []),
    [enrichedHoldings, mode]
  )

  const total = useMemo(
    () => slices.reduce((s, x) => s + x.value, 0),
    [slices]
  )

  const unpricedCount = useMemo(
    () =>
      (enrichedHoldings || []).filter(
        (h) => h.priceAvailable === false && h.asset_type !== 'cash'
      ).length,
    [enrichedHoldings]
  )

  const activeIndex = hoverIndex ?? pinnedIndex ?? undefined
  const active = activeIndex != null ? slices[activeIndex] : undefined

  const pin = (i: number) => {
    setPinnedIndex((prev) => (prev === i ? null : i))
  }

  if (slices.length === 0) {
    const hasHoldings = (enrichedHoldings || []).length > 0
    return (
      <div className="empty-state">
        <p className="font-display text-lg font-medium text-foreground">
          No allocation data
        </p>
        <p>
          {hasHoldings
            ? 'Live prices may be temporarily unavailable.'
            : 'Record a transaction to see allocation.'}
        </p>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative z-0 overflow-visible">
      <div className="mb-3">
        <SegmentedControl
          aria-label="Allocation grouping"
          size="sm"
          options={MODE_OPTIONS}
          value={mode}
          onChange={onModeChange}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] md:items-center lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="relative z-10 mx-auto h-72 w-full min-w-0 max-w-sm overflow-visible">
          <ResponsiveContainer
            width="100%"
            height={288}
            initialDimension={{ width: 320, height: 288 }}
          >
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
                onMouseEnter={(_, index) => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(undefined)}
                onClick={(_, index) => pin(index)}
                isAnimationActive={false}
              >
                {slices.map((entry, i) => (
                  <Cell
                    key={entry.id}
                    fill={entry.color}
                    opacity={
                      activeIndex === undefined || activeIndex === i ? 1 : 0.4
                    }
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </Pie>
              <Tooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 50, outline: 'none' }}
                contentStyle={{ zIndex: 50 }}
                content={({ active: tipOn, payload }) => {
                  if (!tipOn || !payload?.[0]) return null
                  const p = payload[0].payload as Slice
                  return (
                    <div className="relative z-50 rounded-md border bg-card px-3 py-2 text-sm shadow-lg">
                      <div className="font-medium">{p.name}</div>
                      {p.subtitle ? (
                        <div className="text-xs text-muted-foreground">
                          {p.subtitle}
                        </div>
                      ) : null}
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

          <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center px-8 text-center">
            {active ? (
              <>
                <span className="max-w-[9rem] truncate text-xs font-medium text-foreground">
                  {active.name}
                </span>
                <span className="text-base font-semibold tabular-nums sm:text-lg">
                  {(active.percent * 100).toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total
                </span>
                <span className="text-base font-semibold tabular-nums sm:text-lg">
                  <SensitiveValue value={formatCurrency(total, currency, 1)} />
                </span>
              </>
            )}
          </div>
        </div>

        <ul className="z-0 flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          {slices.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted/60"
                title={s.subtitle ? `${s.name} · ${s.subtitle}` : s.name}
                aria-pressed={pinnedIndex === i}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(undefined)}
                onFocus={() => setHoverIndex(i)}
                onBlur={() => setHoverIndex(undefined)}
                onClick={() => pin(i)}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium leading-snug">
                    {s.name}
                  </span>
                  {s.subtitle ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.subtitle}
                    </span>
                  ) : null}
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

      {unpricedCount > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {unpricedCount} unpriced {unpricedCount === 1 ? 'holding' : 'holdings'}{' '}
          not shown.
        </p>
      ) : null}
    </div>
  )
}
