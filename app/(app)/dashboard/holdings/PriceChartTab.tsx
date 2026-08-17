'use client'

/**
 * Price tab UI: pick a holding + time range, load OHLC history, show progress.
 *
 * Data flow:
 * 1. User selects symbol / range (debounced).
 * 2. Server action getHoldingPriceChart:
 *    - full backfill if DB empty (crypto: Binance ~3Y; Yahoo-catalog funds:
 *      Yahoo daily; other stocks/ETFs: Finnhub ~2Y)
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
  SyncMode,
  TradeMarker,
} from '@/lib/priceHistory'
import type { EnrichedHolding } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import { getSecurityPricing } from '@/lib/symbols'
import HoldingPriceChart from './HoldingPriceChart'
import { SegmentedControl } from './SegmentedControl'

/** Client-side load UX states (server returns sync.mode for ready-state copy). */
type LoadPhase = 'idle' | 'loading' | 'backfilling' | 'ready' | 'error'

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

function statusLabel(
  phase: LoadPhase,
  symbol: string,
  mode?: SyncMode
): string {
  switch (phase) {
    case 'loading':
      return `Loading chart for ${symbol}…`
    case 'backfilling':
      return `Loading price history for ${symbol}…`
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
  const [error, setError] = useState<string | null>(null)
  const [bars, setBars] = useState<PriceBar[]>([])
  const [markers, setMarkers] = useState<TradeMarker[]>([])
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
    setError(null)
    setSoftWarning(null)
    // Clear previous series so we never flash the wrong symbol's candles
    setBars([])
    setMarkers([])
    setPhase('backfilling')

    try {
      const result: HoldingPriceChartResult = await getHoldingPriceChart({
        symbol: selected.symbol,
        assetType: selected.asset_type,
        range,
      })

      // A newer request was started — drop this result
      if (reqId !== reqIdRef.current) return

      if (!result.data) {
        setPhase('error')
        setError(result.error || 'Failed to load chart')
        setBars([])
        setMarkers([])
        return
      }

      const mode = result.data.sync.mode
      setSyncMode(mode)
      setBars(result.data.bars)
      setMarkers(result.data.markers)
      setLastSyncedAt(result.data.sync.lastSyncedAt)
      // Server may return bars + a soft error (e.g. gap fill failed, cache used)
      setSoftWarning(result.error ?? null)
      setPhase('ready')
    } catch {
      if (reqId !== reqIdRef.current) return
      setPhase('error')
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
      <div className="empty-state">
        <p className="font-display text-lg font-medium text-foreground">
          No chartable holdings
        </p>
        <p>Record a stock, ETF, or crypto position to view price history.</p>
      </div>
    )
  }

  const busy = phase === 'loading' || phase === 'backfilling'
  const showChart = bars.length > 0 && phase !== 'error'
  const assetType = selected?.asset_type

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

        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <SegmentedControl
            aria-label="Price chart time range"
            size="sm"
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
            disabled={busy}
          />
          <span className="text-[11px] text-muted-foreground">
            Candle window for this holding — not Performance Daily / Monthly.
          </span>
        </div>
      </div>

      {busy ? (
        <p className="text-xs text-muted-foreground">
          {statusLabel(phase, selected?.symbol ?? '', syncMode)}
        </p>
      ) : phase === 'ready' ? (
        <p className="text-xs text-muted-foreground">
          {statusLabel(phase, selected?.symbol ?? '', syncMode)}
        </p>
      ) : null}

      {error && (
        <div className="alert-error flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="alert-warning text-xs">
          {softWarning} Showing last saved history where available.
        </div>
      )}

      {showChart ? (
        <HoldingPriceChart
          bars={bars}
          markers={markers}
          preferredCurrency={preferredCurrency}
          symbol={selected?.symbol}
        />
      ) : (
        !error && (
          <div className="empty-state h-[360px]">
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
              : selected &&
                  getSecurityPricing(selected.symbol).kind === 'yahoo_chart'
                ? 'Daily NAV · Yahoo Finance'
                : 'Daily candles · Finnhub OHLC'}
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
