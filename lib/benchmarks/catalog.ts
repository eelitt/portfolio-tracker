import type { ChartAssetType } from '@/lib/priceHistory'

export const BENCH_SERIES_PREFIX = 'bench:'

export type BenchmarkId = 'SPY' | 'URTH' | 'BTC'

export type BenchmarkPreset = {
  id: BenchmarkId
  label: string
  shortLabel: string
  symbol: string
  assetType: ChartAssetType
  color: string
}

export const BENCHMARK_PRESETS: readonly BenchmarkPreset[] = [
  {
    id: 'SPY',
    label: 'S&P 500 (SPY)',
    shortLabel: 'S&P 500',
    symbol: 'SPY',
    assetType: 'etf',
    color: '#38bdf8',
  },
  {
    id: 'URTH',
    label: 'MSCI World (URTH)',
    shortLabel: 'MSCI World',
    symbol: 'URTH',
    assetType: 'etf',
    color: '#a78bfa',
  },
  {
    id: 'BTC',
    label: 'Bitcoin (BTC)',
    shortLabel: 'Bitcoin',
    symbol: 'BTC',
    assetType: 'crypto',
    color: '#fb923c',
  },
] as const

export function benchmarkSeriesId(id: BenchmarkId): string {
  return `${BENCH_SERIES_PREFIX}${id}`
}

export function parseBenchmarkSeriesId(seriesId: string): BenchmarkId | null {
  if (!seriesId.startsWith(BENCH_SERIES_PREFIX)) return null
  const id = seriesId.slice(BENCH_SERIES_PREFIX.length)
  return BENCHMARK_PRESETS.some((p) => p.id === id) ? (id as BenchmarkId) : null
}

export function isBenchmarkSeriesId(id: string): boolean {
  return parseBenchmarkSeriesId(id) != null
}

export function getBenchmarkPreset(id: string): BenchmarkPreset | undefined {
  return BENCHMARK_PRESETS.find((p) => p.id === id)
}
