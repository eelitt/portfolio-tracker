'use client'

/**
 * Price tab UI: pick a holding + time range, load OHLC history, show progress.
 *
 * Data flow:
 * 1. User selects symbol / range (debounced).
 * 2. Server action getHoldingPriceChart:
 *    - full backfill if DB empty (crypto: Binance ~3Y; stocks: Finnhub ~2Y)
 *    - otherwise gap-fill latest days from the same APIs
 *    - returns bars (display currency) + buy/sell markers from transactions
 * 3. HoldingPriceChart renders candles + markers.
 *
 * Does not run on dashboard first paint — only when this tab is mounted
 * and a symbol is selected (keeps free API usage lazy).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getHoldingPriceChart } from '@/app/actions/priceHistory'
import type {
  ChartRange,
  HoldingPriceChartResult,
  PriceBar,
  SeriesKind,
  SyncMode,
  TradeMarker,
} from '@/lib/priceHistory'
import type { EnrichedHolding } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import HoldingPriceChart from './HoldingPriceChart'
import { SegmentedControl } from './SegmentedControl'

/** Client-side load UX phases (server returns sync.mode for ready-state copy). */
type LoadPhase =
  | 'idle'
  | 'loading'
  | 'backfilling'
  | 'updating'
  | 'ready'
  | 'error'

type Props = {
  holdings: EnrichedHolding[]
  preferredCurrency: PreferredCurrency
}

const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '1Y', label: '1Y' },
  { value: 'Max', label: 'Max' },
]

/** Approximate progress width while the single server action is in flight. */
function progressForPhase(phase: LoadPhase): number {
  switch (phase) {
    case 'idle':
      return 0
    case 'loading':
      return 15
    case 'backfilling':
      return 55
    case 'updating':
      return 70
    case 'ready':
      return 100
    case 'error':
      return 100
    default:
      return 0
  }
}

function statusLabel(
  phase: LoadPhase,
  symbol: string,
  mode?: SyncMode
): string {
  switch (phase) {
    case 'loading':
      return `Loading chart for ${symbol}…`
    case 'backfilling':
      return `Downloading historical prices for ${symbol}…`
    case 'updating':
      return `Updating latest prices for ${symbol}…`
    case 'ready':
      // mode comes from server: full | gap | cache_only
      if (mode === 'full') return `History saved for ${symbol}`
      if (mode === 'gap') return `Latest data updated for ${symbol}`
      return `Showing cached history for ${symbol}`
    case 'error':
      return 'Could not load price history'
    default:
      return ''
  }
}

export default function PriceChartTab({ holdings, preferredCurrency }: Props) {
  // Cash has no market OHLC — only stock / etf / crypto
  const assetHoldings = useMemo(
    () => holdings.filter((h) => h.asset_type !== 'cash'),
    [holdings]
  )

  const [symbol, setSymbol] = useState(assetHoldings[0]?.symbol ?? '')
  const [range, setRange] = useState<ChartRange>('Max')
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [bars, setBars] = useState<PriceBar[]>([])
  const [markers, setMarkers] = useState<TradeMarker[]>([])
  const [seriesKind, setSeriesKind] = useState<SeriesKind>('candle')
  const [assetType, setAssetType] = useState<string | null>(null)
  const [syncMode, setSyncMode] = useState<SyncMode | undefined>()
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  /** Soft (non-fatal) message from server, e.g. partial sync / rate limit with cache */
  const [softWarning, setSoftWarning] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ignore stale responses when user switches symbol/range quickly
  const reqIdRef = useRef(0)

  const selected =
    assetHoldings.find((h) => h.symbol === symbol) ?? assetHoldings[0]

  // If holdings list changes (tx delete, etc.), keep selected symbol valid
  useEffect(() => {
    if (assetHoldings.length === 0) {
      setSymbol('')
      return
    }
    if (!assetHoldings.some((h) => h.symbol === symbol)) {
      setSymbol(assetHoldings[0].symbol)
    }
  }, [assetHoldings, symbol])

  const load = useCallback(async () => {
    if (!selected) return

    const reqId = ++reqIdRef.current
    setPhase('loading')
    setProgress(15)
    setError(null)
    setSoftWarning(null)
    // Clear previous series so we never flash the wrong symbol's candles
    setBars([])
    setMarkers([])

    // Fake progress while waiting (one round-trip; real work is on the server)
    const tick = window.setInterval(() => {
      setProgress((p) => Math.min(p + 4, 85))
    }, 400)

    // Default copy assumes full download; refined after response via syncMode
    setPhase('backfilling')

    try {
      const result: HoldingPriceChartResult = await getHoldingPriceChart({
        symbol: selected.symbol,
        assetType: selected.asset_type,
        range,
      })

      // A newer request was started — drop this result
      if (reqId !== reqIdRef.current) return

      window.clearInterval(tick)

      if (!result.data) {
        setPhase('error')
        setProgress(100)
        setError(result.error || 'Failed to load chart')
        setBars([])
        setMarkers([])
        return
      }

      const mode = result.data.sync.mode
      setSyncMode(mode)
      setProgress(100)
      setBars(result.data.bars)
      setMarkers(result.data.markers)
      setSeriesKind(result.data.seriesKind)
      setAssetType(result.data.assetType)
      setLastSyncedAt(result.data.sync.lastSyncedAt)
      // Server may return bars + a soft error (e.g. gap fill failed, cache used)
      setSoftWarning(result.error ?? null)
      setPhase('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      window.clearInterval(tick)
      setPhase('error')
      setProgress(100)
      setError('Failed to load chart. Please try again.')
    }
  }, [selected, range])

  // Debounce so rapid chip/symbol clicks don't spam Binance/Finnhub
  useEffect(() => {
    if (!selected) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void load()
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when selection/range changes
  }, [selected?.symbol, selected?.asset_type, range])

  if (assetHoldings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        Record a stock, ETF, or crypto position to view price history.
      </div>
    )
  }

  const busy =
    phase === 'loading' || phase === 'backfilling' || phase === 'updating'
  const showChart = bars.length > 0 && phase !== 'error'

  return (
    <div className="space-y-4">
      {/* Controls: holding select + range chips */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="text-sm text-muted-foreground"
            htmlFor="price-chart-symbol"
          >
            Holding
          </label>
          <select
            id="price-chart-symbol"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={selected?.symbol ?? ''}
            onChange={(e) => setSymbol(e.target.value)}
            disabled={busy}
          >
            {assetHoldings.map((h) => (
              <option key={`${h.asset_type}-${h.symbol}`} value={h.symbol}>
                {h.symbol} ({h.asset_type})
              </option>
            ))}
          </select>
        </div>

        <SegmentedControl
          aria-label="Price chart time range"
          size="sm"
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
          disabled={busy}
        />
      </div>

      {/* Progress bar: cold full backfill can take several seconds */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {statusLabel(phase, selected?.symbol ?? '', syncMode)}
          </span>
          {busy && (
            <span>
              {Math.round(progressForPhase(phase) || progress)}%
            </span>
          )}
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Price history load progress"
        >
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              phase === 'error' ? 'bg-red-500' : 'bg-primary'
            }`}
            style={{
              width: `${
                phase === 'ready' || phase === 'error'
                  ? 100
                  : Math.max(progress, progressForPhase(phase))
              }%`,
            }}
          />
        </div>
      </div>

      {error && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      )}

      {softWarning && !error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {softWarning} Showing last saved history where available.
        </div>
      )}

      {showChart ? (
        <HoldingPriceChart
          bars={bars}
          markers={markers}
          seriesKind={seriesKind}
          preferredCurrency={preferredCurrency}
          symbol={selected?.symbol}
        />
      ) : (
        !error && (
          <div className="flex h-[360px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
            {busy ? 'Preparing chart…' : 'No chart data yet'}
          </div>
        )
      )}

      {/* Legend + data source + display currency */}
      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-green-600 mr-1" />
            Buy
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-red-600 mr-1" />
            Sell
          </span>
          <span>
            {assetType === 'crypto'
              ? 'Daily candles · Binance spot (USDT)'
              : 'Daily candles (Finnhub OHLC)'}
          </span>
        </div>
        <div className="text-right">
          {lastSyncedAt && (
            <span>
              Last synced{' '}
              {new Date(lastSyncedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          )}
          <span className="ml-2">· Prices in {preferredCurrency}</span>
        </div>
      </div>
    </div>
  )
}
