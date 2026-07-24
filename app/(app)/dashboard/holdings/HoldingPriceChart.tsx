'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts'
import type { PriceBar, SeriesKind, TradeMarker } from '@/lib/priceHistory'

type Props = {
  bars: PriceBar[]
  markers: TradeMarker[]
  seriesKind: SeriesKind
  height?: number
}

function buildMarkers(markers: TradeMarker[]): SeriesMarker<Time>[] {
  // One marker per day+side; if multiple same day, last wins for position,
  // text notes quantity sum is not required for v1.
  const out: SeriesMarker<Time>[] = []
  for (const m of markers) {
    out.push({
      time: m.timeKey as Time,
      position: m.side === 'buy' ? 'belowBar' : 'aboveBar',
      color: m.side === 'buy' ? '#16a34a' : '#dc2626',
      shape: m.side === 'buy' ? 'arrowUp' : 'arrowDown',
      text: m.side === 'buy' ? 'B' : 'S',
    })
  }
  // lightweight-charts requires markers sorted by time
  out.sort((a, b) => String(a.time).localeCompare(String(b.time)))
  return out
}

export default function HoldingPriceChart({
  bars,
  markers,
  seriesKind,
  height = 360,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

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
    chartRef.current = chart

    let series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>
    if (seriesKind === 'candle') {
      series = chart.addSeries(CandlestickSeries, {
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
    } else {
      series = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
      })
      const data: LineData<Time>[] = bars.map((b) => ({
        time: b.time as Time,
        value: b.close,
      }))
      series.setData(data)
    }

    if (markers.length > 0) {
      createSeriesMarkers(series, buildMarkers(markers))
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return
      chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(el)
    chart.applyOptions({ width: el.clientWidth })

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [bars, markers, seriesKind, height])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg border border-border bg-card/40"
      style={{ height }}
    />
  )
}
