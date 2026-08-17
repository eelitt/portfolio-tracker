'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/currency'
import {
  aggregateSnapshotSeries,
  colorForHoldingSymbol,
  colorForSeriesIndex,
  indexSnapshotSeries,
  mergeSeriesToChartRows,
  PORTFOLIO_SERIES_ID,
  seriesRangeChange,
  type PerformanceScaleMode,
  type SnapshotPoint,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import {
  clipToDateRange,
  excessReturn,
  isBenchmarkSeriesId,
  trackingError,
} from '@/lib/benchmarks'
import type { PreferredCurrency } from '@/lib/userTypes'
import SensitiveValue from '@/components/SensitiveValue'
import { useHideMoney } from '@/app/(app)/privacy/PrivacyModeProvider'
import { MONEY_MASK } from '@/lib/privacyMode'
import { cn } from '@/lib/utils'

export type PerformanceSeriesMeta = {
  id: string
  label: string
  /** Stroke color */
  color: string
  /** Thicker line for portfolio */
  emphasis?: boolean
  /** Benchmarks use a dashed stroke */
  dashed?: boolean
}

interface PerformanceChartProps {
  /** id → raw daily points (pre-aggregation) */
  seriesById: Record<string, SnapshotPoint[]>
  /** Legend order and labels */
  seriesMeta: PerformanceSeriesMeta[]
  /** Which series ids are drawn */
  visibleIds: string[]
  onToggleSeries: (id: string) => void
  rangeMode: SnapshotRangeMode
  scaleMode: PerformanceScaleMode
  preferredCurrency: PreferredCurrency
  /** Fatal: no portfolio history (blank the chart). */
  error?: string | null
  /** Non-fatal: holding or benchmark load failed; chart still draws. */
  warning?: string | null
  loading?: boolean
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
  seriesById,
  seriesMeta,
  visibleIds,
  onToggleSeries,
  rangeMode,
  scaleMode,
  preferredCurrency,
  error,
  warning,
  loading,
}: PerformanceChartProps) {
  const hideMoney = useHideMoney()
  const isIndexed = scaleMode === 'indexed'

  if (error) {
    return (
      <div className="empty-state h-80">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="empty-state h-80">
        <p className="text-muted-foreground">Loading performance history…</p>
      </div>
    )
  }

  const windowedById: Record<string, SnapshotPoint[]> = {}
  const aggregated: Record<string, SnapshotPoint[]> = {}
  for (const meta of seriesMeta) {
    const raw = seriesById[meta.id] ?? []
    const windowed = aggregateSnapshotSeries(raw, rangeMode)
    windowedById[meta.id] = windowed
    if (isIndexed) {
      const indexed = indexSnapshotSeries(windowed)
      aggregated[meta.id] = indexed ?? []
    } else {
      aggregated[meta.id] = windowed
    }
  }

  const visibleWithData = visibleIds.filter(
    (id) => (aggregated[id]?.length ?? 0) > 0
  )

  const hasAnyHistory = seriesMeta.some(
    (m) => (seriesById[m.id]?.length ?? 0) > 0
  )

  if (!hasAnyHistory) {
    return (
      <div className="empty-state h-80">
        <p className="font-display text-lg font-medium text-foreground">
          No performance history yet
        </p>
        <p>The chart builds as daily portfolio snapshots are recorded.</p>
      </div>
    )
  }

  const chartRows = mergeSeriesToChartRows(aggregated, visibleWithData).map(
    (row) => ({
      ...row,
      label: formatTick(String(row.date), rangeMode),
    })
  )

  const portfolioAgg = aggregated[PORTFOLIO_SERIES_ID] ?? []
  const portfolioChange =
    !isIndexed && visibleIds.includes(PORTFOLIO_SERIES_ID)
      ? seriesRangeChange(portfolioAgg)
      : null

  const metaById = new Map(seriesMeta.map((m) => [m.id, m]))
  const holdingLegend = seriesMeta.filter((m) => !isBenchmarkSeriesId(m.id))
  const visibleBenches = visibleIds.filter((id) => isBenchmarkSeriesId(id))
  const portWindowed = windowedById[PORTFOLIO_SERIES_ID] ?? []
  const windowStart = portWindowed[0]?.date
  const windowEnd = portWindowed[portWindowed.length - 1]?.date

  return (
    <div>
      {warning ? (
        <p className="mb-2 text-xs text-muted-foreground">{warning}</p>
      ) : null}
      {portfolioChange && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Portfolio change in range</span>
          <span
            className={
              portfolioChange.absolute >= 0
                ? 'font-medium text-pnl-positive'
                : 'font-medium text-pnl-negative'
            }
          >
            <SensitiveValue
              value={formatCurrency(
                portfolioChange.absolute,
                preferredCurrency,
                1
              )}
            />{' '}
            ({portfolioChange.percent >= 0 ? '+' : ''}
            {portfolioChange.percent.toFixed(2)}%)
          </span>
        </div>
      )}

      {isIndexed && (
        <p className="mb-2 text-xs text-muted-foreground">
          Indexed: each series starts at 0% at the beginning of the range.
        </p>
      )}

      {visibleBenches.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {visibleBenches.map((id) => {
            const meta = metaById.get(id)
            const benchWin = windowedById[id] ?? []
            const ex = excessReturn(portWindowed, benchWin)
            const te =
              windowStart && windowEnd
                ? trackingError(
                    clipToDateRange(
                      seriesById[PORTFOLIO_SERIES_ID] ?? [],
                      windowStart,
                      windowEnd
                    ),
                    clipToDateRange(seriesById[id] ?? [], windowStart, windowEnd)
                  )
                : null
            if (!ex) {
              return (
                <p key={id} className="text-xs text-muted-foreground">
                  {meta?.label ?? id}: not enough overlapping history in this range.
                </p>
              )
            }
            return (
              <p key={id} className="text-xs text-muted-foreground">
                <span className="text-foreground">{meta?.label ?? id}</span>
                {' · '}
                Portfolio {ex.portfolioPercent >= 0 ? '+' : ''}
                {ex.portfolioPercent.toFixed(2)}%
                {' · '}
                Bench {ex.benchmarkPercent >= 0 ? '+' : ''}
                {ex.benchmarkPercent.toFixed(2)}%
                {' · '}
                Excess{' '}
                <span
                  className={
                    ex.excessPp >= 0 ? 'text-pnl-positive' : 'text-pnl-negative'
                  }
                >
                  {ex.excessPp >= 0 ? '+' : ''}
                  {ex.excessPp.toFixed(2)} pp
                </span>
                {te ? (
                  <>
                    {' · '}
                    TE {te.dailyStDevPp.toFixed(2)} pp daily
                    {te.annualizedStDevPp != null && (
                      <> · {te.annualizedStDevPp.toFixed(1)} pp ann.</>
                    )}
                  </>
                ) : null}
              </p>
            )
          })}
          <p className="text-[11px] text-muted-foreground/90">
            Portfolio is market value (cash in/out counts). Benchmarks are price
            only — not time-weighted return.
          </p>
        </div>
      )}

      {chartRows.length === 0 || visibleWithData.length === 0 ? (
        <div className="empty-state h-64">
          <p className="text-muted-foreground">
            {visibleIds.length === 0
              ? 'Turn on one or more series in the legend below.'
              : 'No data in this range for the selected series.'}
          </p>
        </div>
      ) : (
        <div className="mt-2 h-80 w-full min-w-0">
          <ResponsiveContainer
            width="100%"
            height={320}
            initialDimension={{ width: 640, height: 320 }}
          >
            <LineChart
              data={chartRows}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
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
                tickFormatter={(v) => {
                  if (isIndexed) {
                    return `${Number(v).toFixed(0)}%`
                  }
                  if (hideMoney) return MONEY_MASK
                  return formatCurrency(Number(v), preferredCurrency, 1).replace(
                    /[^\d.,\s-]/g,
                    ''
                  )
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const date = payload[0]?.payload?.date as string | undefined
                  return (
                    <div className="max-w-xs rounded-md border bg-card px-3 py-2 text-sm shadow-md">
                      <div className="mb-1 font-medium">{date}</div>
                      <ul className="space-y-0.5">
                        {payload.map((entry) => {
                          const id = String(entry.dataKey)
                          const meta = metaById.get(id)
                          const raw = entry.value
                          if (raw == null || !Number.isFinite(Number(raw))) {
                            return null
                          }
                          const n = Number(raw)
                          return (
                            <li
                              key={id}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                />
                                {meta?.label ?? id}
                              </span>
                              <span className="tabular-nums">
                                {isIndexed
                                  ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
                                  : hideMoney
                                    ? MONEY_MASK
                                    : formatCurrency(n, preferredCurrency, 1)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                }}
              />
              <Legend content={() => null} />
              {visibleWithData.map((id) => {
                const meta = metaById.get(id)
                if (!meta) return null
                return (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    name={meta.label}
                    stroke={meta.color}
                    strokeWidth={meta.emphasis ? 2.5 : 1.75}
                    strokeDasharray={meta.dashed ? '5 4' : undefined}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Clickable legend */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {holdingLegend.map((meta) => {
          const on = visibleIds.includes(meta.id)
          const hasData = (seriesById[meta.id]?.length ?? 0) > 0
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onToggleSeries(meta.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                on
                  ? 'border-border bg-muted/60 text-foreground'
                  : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/40',
                !hasData && 'opacity-50'
              )}
              title={
                hasData
                  ? on
                    ? `Hide ${meta.label}`
                    : `Show ${meta.label}`
                  : `${meta.label}: no history yet`
              }
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: on ? meta.color : 'transparent',
                  boxShadow: on ? undefined : `inset 0 0 0 1px ${meta.color}`,
                }}
              />
              {meta.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Assign colors: portfolio first gold, then holdings in order. */
export function buildSeriesMeta(
  holdings: { id: string; label: string }[]
): PerformanceSeriesMeta[] {
  const meta: PerformanceSeriesMeta[] = [
    {
      id: PORTFOLIO_SERIES_ID,
      label: 'Portfolio',
      color: colorForSeriesIndex(0),
      emphasis: true,
    },
  ]
  holdings.forEach((h) => {
    meta.push({
      id: h.id,
      label: h.label,
      color: colorForHoldingSymbol(h.label),
    })
  })
  return meta
}
