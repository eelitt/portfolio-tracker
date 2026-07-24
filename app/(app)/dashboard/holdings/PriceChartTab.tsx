'use client'

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

const RANGES: ChartRange[] = ['1M', '3M', '1Y', 'Max']

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
  const assetHoldings = useMemo(
    () => holdings.filter((h) => h.asset_type !== 'cash'),
    [holdings]
  )

  const [symbol, setSymbol] = useState(assetHoldings[0]?.symbol ?? '')
  const [range, setRange] = useState<ChartRange>('1Y')
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [bars, setBars] = useState<PriceBar[]>([])
  const [markers, setMarkers] = useState<TradeMarker[]>([])
  const [seriesKind, setSeriesKind] = useState<SeriesKind>('candle')
  const [assetType, setAssetType] = useState<string | null>(null)
  const [syncMode, setSyncMode] = useState<SyncMode | undefined>()
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [softWarning, setSoftWarning] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqIdRef = useRef(0)

  const selected = assetHoldings.find((h) => h.symbol === symbol) ?? assetHoldings[0]

  // Keep selection valid when holdings change
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
    // Avoid showing previous symbol while a new request is in flight
    setBars([])
    setMarkers([])

    // Staged progress while waiting on the single server action
    const tick = window.setInterval(() => {
      setProgress((p) => Math.min(p + 4, 85))
    }, 400)

    // Cold load = backfill label; warm gap is refined when the action returns
    setPhase('backfilling')

    try {
      const result: HoldingPriceChartResult = await getHoldingPriceChart({
        symbol: selected.symbol,
        assetType: selected.asset_type,
        range,
      })

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

  // Debounced load on symbol/range change
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

  const busy = phase === 'loading' || phase === 'backfilling' || phase === 'updating'
  const showChart = bars.length > 0 && phase !== 'error'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="price-chart-symbol">
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

        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={range === r ? 'default' : 'outline'}
              onClick={() => setRange(r)}
              disabled={busy}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {statusLabel(
              phase,
              selected?.symbol ?? '',
              syncMode
            )}
          </span>
          {busy && <span>{Math.round(progressForPhase(phase) || progress)}%</span>}
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
              width: `${phase === 'ready' || phase === 'error' ? 100 : Math.max(progress, progressForPhase(phase))}%`,
            }}
          />
        </div>
      </div>

      {error && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
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
        <HoldingPriceChart bars={bars} markers={markers} seriesKind={seriesKind} />
      ) : (
        !error && (
          <div className="flex h-[360px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
            {busy ? 'Preparing chart…' : 'No chart data yet'}
          </div>
        )
      )}

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
              ? 'Daily candles · Binance spot (USDT) · up to 3Y · live quotes: CoinGecko'
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
