'use client'

/**
 * Imperative OHLC chart for one holding (lightweight-charts).
 *
 * Buy/sell markers: one per calendar day with trades. Hover/click a day with
 * trades (or any bar for OHLC) shows an HTML tooltip overlay — native markers
 * cannot host rich content.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  ColorType,
  type CandlestickData,
  type Time,
  type SeriesMarker,
  type MouseEventParams,
} from 'lightweight-charts'
import type { PriceBar, TradeMarker } from '@/lib/priceHistory'
import {
  dayMarkerStyles,
  groupMarkersByDay,
} from '@/lib/priceHistory'
import { formatCurrency, formatQuantity } from '@/lib/currency'
import type { PreferredCurrency } from '@/lib/userTypes'
import SensitiveValue from '@/components/SensitiveValue'
import { cn } from '@/lib/utils'

type Props = {
  bars: PriceBar[]
  markers: TradeMarker[]
  preferredCurrency: PreferredCurrency
  /** Ticker for quantity decimals (e.g. BTC). */
  symbol?: string
  height?: number
}

type TooltipState = {
  /** CSS left/top inside the chart container */
  x: number
  y: number
  day: string
  trades: TradeMarker[]
  ohlc: PriceBar | null
  pinned: boolean
}

function timeToDayKey(time: Time | undefined): string | null {
  if (time == null) return null
  if (typeof time === 'string') return time.slice(0, 10)
  if (typeof time === 'number') {
    return new Date(time * 1000).toISOString().slice(0, 10)
  }
  // BusinessDay
  if (typeof time === 'object' && 'year' in time) {
    const y = time.year
    const m = String(time.month).padStart(2, '0')
    const d = String(time.day).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

function buildLibraryMarkers(
  styles: ReturnType<typeof dayMarkerStyles>,
  barDays: Set<string>
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = []
  for (const s of styles) {
    // Only place markers on days that exist in the series (library requirement)
    if (!barDays.has(s.timeKey)) continue
    out.push({
      time: s.timeKey as Time,
      id: s.id,
      position: s.position,
      color: s.color,
      shape: s.shape,
      text: s.text,
    })
  }
  return out
}

function formatTradeWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function HoldingPriceChart({
  bars,
  markers,
  preferredCurrency,
  symbol = '',
  height = 360,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const byDayRef = useRef(new Map<string, TradeMarker[]>())
  const barsByDayRef = useRef(new Map<string, PriceBar>())
  const pinnedDayRef = useRef<string | null>(null)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const byDay = useMemo(() => groupMarkersByDay(markers), [markers])
  const dayStyles = useMemo(() => dayMarkerStyles(byDay), [byDay])
  const barDays = useMemo(() => new Set(bars.map((b) => b.time)), [bars])
  const barsByDay = useMemo(() => {
    const m = new Map<string, PriceBar>()
    for (const b of bars) m.set(b.time, b)
    return m
  }, [bars])

  byDayRef.current = byDay
  barsByDayRef.current = barsByDay

  // Build chart + wire hover/click for tooltips
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    pinnedDayRef.current = null
    setTooltip(null)

    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.12)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.12)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.2)',
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.2)',
      },
      crosshair: {
        mode: 1,
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    })
    const data: CandlestickData<Time>[] = bars.map((b) => ({
      time: b.time as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))
    series.setData(data)

    const libMarkers = buildLibraryMarkers(dayStyles, barDays)
    if (libMarkers.length > 0) {
      createSeriesMarkers(series, libMarkers)
    }

    chart.timeScale().fitContent()

    const placeTooltip = (
      day: string,
      point: { x: number; y: number } | undefined,
      pinned: boolean
    ) => {
      const trades = byDayRef.current.get(day) ?? []
      const ohlc = barsByDayRef.current.get(day) ?? null
      if (trades.length === 0 && !ohlc) {
        if (!pinned) setTooltip(null)
        return
      }

      const w = el.clientWidth
      const h = el.clientHeight
      let x = point?.x ?? w / 2
      let y = point?.y ?? 40
      // Prefer above-left of cursor; clamp inside container
      const tipW = 220
      const tipH = 120
      x = Math.min(Math.max(8, x + 12), w - tipW - 8)
      y = Math.min(Math.max(8, y - tipH - 8), h - tipH - 8)

      setTooltip({
        x,
        y,
        day,
        trades,
        ohlc,
        pinned,
      })
    }

    const onCrosshair = (param: MouseEventParams<Time>) => {
      if (pinnedDayRef.current) return
      if (!param.point || param.time === undefined) {
        setTooltip(null)
        return
      }
      const day = timeToDayKey(param.time)
      if (!day) {
        setTooltip(null)
        return
      }
      // Prefer marker hover via id; else any bar day for OHLC
      const hoverId =
        param.hoveredObjectId != null ? String(param.hoveredObjectId) : null
      const tradeDay =
        hoverId && byDayRef.current.has(hoverId)
          ? hoverId
          : byDayRef.current.has(day)
            ? day
            : null

      if (tradeDay) {
        el.style.cursor = 'pointer'
        placeTooltip(tradeDay, param.point, false)
        return
      }

      el.style.cursor = 'default'
      // OHLC-only tooltip for non-trade days
      if (barsByDayRef.current.has(day)) {
        placeTooltip(day, param.point, false)
      } else {
        setTooltip(null)
      }
    }

    const onClick = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined) {
        pinnedDayRef.current = null
        setTooltip(null)
        return
      }
      const day = timeToDayKey(param.time)
      if (!day || !byDayRef.current.has(day)) {
        // Click empty / non-trade: unpin
        pinnedDayRef.current = null
        setTooltip(null)
        return
      }
      // Toggle pin on trade day
      if (pinnedDayRef.current === day) {
        pinnedDayRef.current = null
        placeTooltip(day, param.point, false)
      } else {
        pinnedDayRef.current = day
        placeTooltip(day, param.point, true)
      }
    }

    chart.subscribeCrosshairMove(onCrosshair)
    chart.subscribeClick(onClick)

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return
      chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(el)
    chart.applyOptions({ width: el.clientWidth })

    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair)
      chart.unsubscribeClick(onClick)
      ro.disconnect()
      chart.remove()
    }
  }, [bars, dayStyles, barDays, height])

  return (
    <div
      className="relative w-full rounded-lg border border-border bg-card/40"
      style={{ height }}
    >
      <div ref={containerRef} className="h-full w-full" />

      {tooltip && (
        <div
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-20 max-w-[240px] rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg',
            tooltip.pinned && 'ring-1 ring-primary/40'
          )}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.ohlc && (
            <div className="mb-1.5 space-y-0.5 border-b border-border pb-1.5 text-muted-foreground">
              <div className="font-medium text-foreground">{tooltip.day}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
                <span>Open</span>
                <SensitiveValue
                  value={formatCurrency(
                    tooltip.ohlc.open,
                    preferredCurrency,
                    1
                  )}
                />
                <span>High</span>
                <SensitiveValue
                  value={formatCurrency(
                    tooltip.ohlc.high,
                    preferredCurrency,
                    1
                  )}
                />
                <span>Low</span>
                <SensitiveValue
                  value={formatCurrency(
                    tooltip.ohlc.low,
                    preferredCurrency,
                    1
                  )}
                />
                <span>Close</span>
                <SensitiveValue
                  value={formatCurrency(
                    tooltip.ohlc.close,
                    preferredCurrency,
                    1
                  )}
                />
              </div>
            </div>
          )}

          {tooltip.trades.length > 0 ? (
            <div className="space-y-2">
              {tooltip.trades.map((t, i) => (
                <div key={`${t.time}-${t.side}-${i}`} className="space-y-0.5">
                  <div
                    className={cn(
                      'font-medium',
                      t.side === 'buy' ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {t.side === 'buy' ? 'Buy' : 'Sell'}
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {formatTradeWhen(t.time)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 tabular-nums">
                    <span className="text-muted-foreground">Qty</span>
                    <SensitiveValue
                      value={formatQuantity(t.quantity, preferredCurrency, {
                        symbol,
                      })}
                    />
                  </div>
                  <div className="flex justify-between gap-3 tabular-nums">
                    <span className="text-muted-foreground">Price</span>
                    <SensitiveValue
                      value={formatCurrency(t.price, preferredCurrency, 1)}
                    />
                  </div>
                  <div className="flex justify-between gap-3 tabular-nums">
                    <span className="text-muted-foreground">Total</span>
                    <SensitiveValue
                      value={formatCurrency(
                        t.price * t.quantity,
                        preferredCurrency,
                        1
                      )}
                    />
                  </div>
                  {t.notes ? (
                    <div className="text-muted-foreground line-clamp-2">
                      {t.notes}
                    </div>
                  ) : null}
                </div>
              ))}
              {tooltip.pinned ? (
                <div className="pt-0.5 text-[10px] text-muted-foreground">
                  Click again to unpin
                </div>
              ) : (
                <div className="pt-0.5 text-[10px] text-muted-foreground">
                  Click marker day to pin
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">
              No trades this day
            </div>
          )}
        </div>
      )}
    </div>
  )
}
