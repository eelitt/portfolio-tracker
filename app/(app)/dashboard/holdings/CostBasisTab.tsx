'use client'

import { useEffect, useMemo, useState } from 'react'
import { getInvestedVsCashSeries } from '@/app/actions/snapshots'
import { Button } from '@/components/ui/button'
import {
  aggregateSnapshotSeries,
  holdingSeriesId,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import { formatCurrency } from '@/lib/currency'
import type { InvestedVsCashSeries } from '@/lib/investedVsCash'
import { MONEY_MASK } from '@/lib/privacyMode'
import type { EnrichedHolding } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import { useHideMoney } from '@/app/(app)/privacy/PrivacyModeProvider'
import CostBasisChart from './CostBasisChart'
import { SegmentedControl } from './SegmentedControl'

const RANGES: { value: SnapshotRangeMode; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]

const ALL = 'all'

function optionValue(assetType: string, symbol: string) {
  return `${assetType}-${symbol}`
}

export default function CostBasisTab({
  holdings,
  preferredCurrency,
  active,
}: {
  holdings: EnrichedHolding[]
  preferredCurrency: PreferredCurrency
  active: boolean
}) {
  const hideMoney = useHideMoney()
  const [rangeMode, setRangeMode] = useState<SnapshotRangeMode>('daily')
  const [selection, setSelection] = useState(ALL)
  const [series, setSeries] = useState<InvestedVsCashSeries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const options = useMemo(
    () =>
      holdings
        .filter(
          (holding) =>
            holding.asset_type === 'stock' ||
            holding.asset_type === 'etf' ||
            holding.asset_type === 'crypto'
        )
        .sort(
          (a, b) =>
            a.symbol.localeCompare(b.symbol) ||
            a.asset_type.localeCompare(b.asset_type)
        ),
    [holdings]
  )

  const selectionKnown =
    selection === ALL ||
    options.some(
      (holding) => optionValue(holding.asset_type, holding.symbol) === selection
    )
  const selected = selectionKnown ? selection : ALL
  const waiting = !series && !error

  useEffect(() => {
    if (!active || series || error) return
    let cancelled = false
    void getInvestedVsCashSeries().then((result) => {
      if (cancelled) return
      if (result.error || !result.data) {
        setSeries(null)
        setError(result.error ?? 'Failed to load portfolio history.')
        return
      }
      setSeries(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [active, series, error, attempt])

  const raw = useMemo(() => {
    if (!series) return []
    if (selected === ALL) return series.portfolio
    const dash = selected.indexOf('-')
    if (dash <= 0) return []
    const id = holdingSeriesId(
      selected.slice(0, dash),
      selected.slice(dash + 1)
    )
    return series.byHolding[id] ?? []
  }, [series, selected])

  const windowed = useMemo(
    () => aggregateSnapshotSeries(raw, rangeMode),
    [raw, rangeMode]
  )

  const last = windowed.length > 0 ? windowed[windowed.length - 1] : null
  const gap = last ? last.marketValue - last.costBasis : null

  const emptyCopy =
    raw.length === 0
      ? selected === ALL
        ? 'The comparison starts once a daily snapshot includes an invested holding.'
        : 'The comparison starts once a daily snapshot includes this holding.'
      : 'No data in this range.'

  function showMoney(amount: number) {
    if (hideMoney) return MONEY_MASK
    return formatCurrency(amount, preferredCurrency, 1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="cost-basis-holding">
            Holding
          </label>
          <select
            id="cost-basis-holding"
            className="h-9 max-w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selected}
            onChange={(event) => setSelection(event.target.value)}
            disabled={waiting}
          >
            <option value={ALL}>All invested</option>
            {options.map((holding) => (
              <option
                key={optionValue(holding.asset_type, holding.symbol)}
                value={optionValue(holding.asset_type, holding.symbol)}
              >
                {holding.symbol} ({holding.asset_type})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <SegmentedControl
            aria-label="Cost basis time aggregation"
            size="sm"
            options={RANGES}
            value={rangeMode}
            onChange={setRangeMode}
          />
          <span className="text-[11px] text-muted-foreground">
            Groups snapshot dates — not the same as Price 1M / 3M / 1Y.
          </span>
        </div>
      </div>

      {error ? (
        <div className="alert-error flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setError(null)
              setSeries(null)
              setAttempt((current) => current + 1)
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {waiting ? (
        <div className="empty-state h-80">
          <p className="text-muted-foreground">Loading cost basis history…</p>
        </div>
      ) : null}

      {!error && series && windowed.length === 0 ? (
        <div className="empty-state h-64">
          <p className="font-display text-lg font-medium text-foreground">
            No cost basis history yet
          </p>
          <p>{emptyCopy}</p>
        </div>
      ) : null}

      {last && gap != null ? (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Market value</div>
            <div className="tabular-nums">{showMoney(last.marketValue)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cost basis</div>
            <div className="tabular-nums">{showMoney(last.costBasis)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Gap</div>
            <div
              className={`tabular-nums ${
                hideMoney || gap === 0
                  ? ''
                  : gap > 0
                    ? 'text-pnl-positive'
                    : 'text-pnl-negative'
              }`}
            >
              {showMoney(gap)}
            </div>
          </div>
        </div>
      ) : null}

      {!error && series && windowed.length > 0 ? (
        <CostBasisChart
          points={windowed}
          rangeMode={rangeMode}
          preferredCurrency={preferredCurrency}
        />
      ) : null}

      {!error && series ? (
        <p className="text-xs text-muted-foreground">
          The gap is the last snapshot in this range, not the live unrealized P&L
          on the holding cards. A trade today shows up on the next daily snapshot.
          An unpriced name is left out of both lines that day, so both lines can
          step down. All invested on a past day still includes a name you have
          since sold. This list does not.
        </p>
      ) : null}
    </div>
  )
}
