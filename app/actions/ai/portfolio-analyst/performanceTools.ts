import { tool } from 'ai'
import { z } from 'zod'
import {
  aggregateSnapshotSeries,
  holdingSeriesId,
  type SnapshotRangeMode,
} from '@/lib/aggregateSnapshots'
import {
  benchmarkSeriesId,
  clipToDateRange,
  contributionFromDeltas,
  seriesDelta,
  trackingError,
  windowReturnPercent,
} from '@/lib/benchmarks'
import {
  cashFlowsFromTransactions,
  dailyTwrs,
  linkedReturn,
  maxDrawdownFromReturns,
  returnVolatility,
} from '@/lib/performance'
import { getBenchmarkSeries } from '@/app/actions/benchmarks'
import {
  getHoldingSnapshotsBatch,
  getPortfolioSnapshots,
} from '@/app/actions/snapshots'
import { toolDescription, toolFailure } from '@/lib/aiTools'
import type { AnalystToolCtx } from './toolContext'

export function createPerformanceTools(ctx: AnalystToolCtx) {
  const { load, loadFailed } = ctx

  return {
    get_relative_performance: tool({
      description: toolDescription('get_relative_performance'),
      parameters: z.object({
        symbols: z
          .array(z.enum(['SPY', 'URTH', 'BTC']))
          .optional()
          .describe('Benchmarks to compare. Defaults to all three.'),
        range: z
          .enum(['daily', 'monthly', 'yearly'])
          .optional()
          .describe('Same windows as the Performance chart. Default daily.'),
      }),
      execute: async (args) => {
        const loaded = await load()
        if (!loaded.ok) return loadFailed(loaded.error)

        const range: SnapshotRangeMode = args.range ?? 'daily'
        const ids = args.symbols?.length
          ? args.symbols
          : (['SPY', 'URTH', 'BTC'] as const)

        const snaps = await getPortfolioSnapshots()
        if (snaps.error) return loadFailed(snaps.error)
        const port = snaps.data ?? []
        if (port.length < 2) {
          return toolFailure(
            'no_snapshot_history',
            'Not enough daily portfolio snapshots to compare. History builds as snapshots are recorded.'
          )
        }

        const benches = await getBenchmarkSeries([...ids])
        if (benches.error) return loadFailed(benches.error)

        const portWin = aggregateSnapshotSeries(port, range)
        const start = portWin[0]?.date
        const end = portWin[portWin.length - 1]?.date
        const portDaily =
          start && end ? clipToDateRange(port, start, end) : []
        const flows = cashFlowsFromTransactions(
          loaded.data.transactions || [],
          loaded.data.preferredCurrency,
          loaded.data.usdToEurRate
        )
        const twrReturns = dailyTwrs(portDaily, flows)
        const twr = linkedReturn(twrReturns)
        const vol = returnVolatility(twrReturns)
        const drawdown = maxDrawdownFromReturns(twrReturns)

        const comparisons = ids.map((id) => {
          const sid = benchmarkSeriesId(id)
          const raw = benches.data?.[sid] ?? []
          const benchDaily =
            start && end ? clipToDateRange(raw, start, end) : []
          const benchPct = windowReturnPercent(benchDaily)
          const te =
            start && end ? trackingError(portDaily, benchDaily) : null
          const excess =
            twr != null && benchPct != null
              ? {
                  twrPercent: twr * 100,
                  benchmarkPercent: benchPct,
                  excessPp: twr * 100 - benchPct,
                }
              : null
          return { id, excess, trackingError: te }
        })

        const open = loaded.holdings.filter((h) => h.quantity > 0)
        const batch = await getHoldingSnapshotsBatch(
          open.map((h) => ({
            symbol: h.symbol,
            assetType: h.asset_type as 'stock' | 'etf' | 'crypto' | 'cash',
          }))
        )
        const contribInputs = open.map((h) => {
          const key = `${h.asset_type}:${h.symbol}`
          const series = batch.data?.[key] ?? []
          return {
            id: holdingSeriesId(h.asset_type, h.symbol),
            label: h.symbol,
            delta: seriesDelta(aggregateSnapshotSeries(series, range)) ?? 0,
          }
        })
        const contribution = contributionFromDeltas(
          seriesDelta(portWin) ?? 0,
          contribInputs
        )

        return {
          range,
          preferredCurrency: loaded.data.preferredCurrency,
          twrPercent: twr != null ? twr * 100 : null,
          volatility: vol
            ? {
                dailyPp: vol.dailyStDev * 100,
                annualizedPp:
                  vol.annualizedStDev != null
                    ? vol.annualizedStDev * 100
                    : null,
              }
            : null,
          maxDrawdownPercent: drawdown ? drawdown.drawdown * 100 : null,
          caveat:
            'TWR treats cash in/out as flows (end-of-day snapshots). Excess is TWR minus bench price return. Not alpha. Contribution is still Δ market value.',
          comparisons,
          contribution: contribution.slice(0, 12),
        }
      },
    }),
  }
}
