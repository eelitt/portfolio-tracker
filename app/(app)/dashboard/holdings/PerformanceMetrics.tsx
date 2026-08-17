'use client'

import { formatCurrency } from '@/lib/currency'
import {
  aggregateSnapshotSeries,
  PORTFOLIO_SERIES_ID,
  seriesRangeChange,
  type PerformanceScaleMode,
  type SnapshotPoint,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import {
  clipToDateRange,
  isBenchmarkSeriesId,
  trackingError,
  windowReturnPercent,
} from '@/lib/benchmarks'
import {
  dailyTwrs,
  linkedReturn,
  maxDrawdownFromReturns,
  returnVolatility,
  type CashFlow,
} from '@/lib/performance'
import type { PreferredCurrency } from '@/lib/userTypes'
import SensitiveValue from '@/components/SensitiveValue'
import type { PerformanceSeriesMeta } from './PerformanceChart'

export default function PerformanceMetrics({
  seriesById,
  seriesMeta,
  visibleIds,
  rangeMode,
  scaleMode,
  preferredCurrency,
  warning,
  cashFlows = [],
}: {
  seriesById: Record<string, SnapshotPoint[]>
  seriesMeta: PerformanceSeriesMeta[]
  visibleIds: string[]
  rangeMode: SnapshotRangeMode
  scaleMode: PerformanceScaleMode
  preferredCurrency: PreferredCurrency
  warning?: string | null
  cashFlows?: CashFlow[]
}) {
  const isIndexed = scaleMode === 'indexed'
  const metaById = new Map(seriesMeta.map((m) => [m.id, m]))
  const visibleBenches = visibleIds.filter((id) => isBenchmarkSeriesId(id))

  const portWindowed = aggregateSnapshotSeries(
    seriesById[PORTFOLIO_SERIES_ID] ?? [],
    rangeMode
  )
  const portfolioChange =
    !isIndexed && visibleIds.includes(PORTFOLIO_SERIES_ID)
      ? seriesRangeChange(portWindowed)
      : null

  const windowStart = portWindowed[0]?.date
  const windowEnd = portWindowed[portWindowed.length - 1]?.date
  const portDaily =
    windowStart && windowEnd
      ? clipToDateRange(
          seriesById[PORTFOLIO_SERIES_ID] ?? [],
          windowStart,
          windowEnd
        )
      : []
  const twrReturns = dailyTwrs(portDaily, cashFlows)
  const twr = linkedReturn(twrReturns)
  const vol = returnVolatility(twrReturns)
  const dd = maxDrawdownFromReturns(twrReturns)

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

      {twr != null && (
        <div className="mb-3 space-y-1 text-xs text-muted-foreground">
          <p>
            TWR{' '}
            <span
              className={
                twr >= 0
                  ? 'font-medium text-pnl-positive'
                  : 'font-medium text-pnl-negative'
              }
            >
              {twr >= 0 ? '+' : ''}
              {(twr * 100).toFixed(2)}%
            </span>
            {vol ? (
              <>
                {' · '}
                Vol {(vol.dailyStDev * 100).toFixed(2)} pp daily
                {vol.annualizedStDev != null && (
                  <> · {(vol.annualizedStDev * 100).toFixed(1)} pp ann.</>
                )}
              </>
            ) : null}
            {dd ? (
              <>
                {' · '}
                Max DD{' '}
                <span className="text-pnl-negative">
                  {(dd.drawdown * 100).toFixed(1)}%
                </span>
              </>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground/90">
            TWR treats cash in/out as flows, not return. Snapshots are
            end-of-day. Chart line is still market value.
          </p>
        </div>
      )}

      {visibleBenches.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {visibleBenches.map((id) => {
            const meta = metaById.get(id)
            const benchDaily =
              windowStart && windowEnd
                ? clipToDateRange(seriesById[id] ?? [], windowStart, windowEnd)
                : []
            const benchPct = windowReturnPercent(benchDaily)
            const te =
              windowStart && windowEnd
                ? trackingError(portDaily, benchDaily)
                : null
            if (twr == null || benchPct == null) {
              return (
                <p key={id} className="text-xs text-muted-foreground">
                  {meta?.label ?? id}: not enough overlapping history in this
                  range.
                </p>
              )
            }
            const excessPp = twr * 100 - benchPct
            return (
              <p key={id} className="text-xs text-muted-foreground">
                <span className="text-foreground">{meta?.label ?? id}</span>
                {' · '}
                TWR {twr >= 0 ? '+' : ''}
                {(twr * 100).toFixed(2)}%
                {' · '}
                Bench {benchPct >= 0 ? '+' : ''}
                {benchPct.toFixed(2)}%
                {' · '}
                Excess{' '}
                <span
                  className={
                    excessPp >= 0 ? 'text-pnl-positive' : 'text-pnl-negative'
                  }
                >
                  {excessPp >= 0 ? '+' : ''}
                  {excessPp.toFixed(2)} pp
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
            Excess is TWR minus bench price return. Tracking error still uses
            daily MV vs price. Not alpha.
          </p>
        </div>
      )}
    </div>
  )
}
