import type {
  PerformanceScaleMode,
} from '@/lib/aggregateSnapshots'
import { BENCHMARK_PRESETS, type BenchmarkId } from '@/lib/benchmarks'

export type ChartTab = 'allocation' | 'performance' | 'price'
export type AllocPieMode = 'holding' | 'type'

const LS_VISIBLE = 'perfChartVisibleSeries'
const LS_SCALE = 'perfChartScaleMode'
const LS_BENCH = 'perfChartBenchmarks'
const LS_TAB = 'chartsTab'
const LS_ALLOC_MODE = 'allocPieMode'

export function readVisibleSet(defaultOn: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(LS_VISIBLE)
    if (!raw) return new Set(defaultOn)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(defaultOn)
    return new Set(parsed.filter((x) => typeof x === 'string'))
  } catch {
    return new Set(defaultOn)
  }
}

export function writeVisibleSet(ids: Set<string>) {
  try {
    localStorage.setItem(LS_VISIBLE, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export function readScaleMode(): PerformanceScaleMode {
  try {
    const v = localStorage.getItem(LS_SCALE)
    if (v === 'indexed' || v === 'absolute') return v
  } catch {
    // ignore
  }
  return 'absolute'
}

export function writeScaleMode(mode: PerformanceScaleMode) {
  try {
    localStorage.setItem(LS_SCALE, mode)
  } catch {
    // ignore
  }
}

export function readBenchIds(): Set<BenchmarkId> {
  try {
    const raw = localStorage.getItem(LS_BENCH)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    const allowed = new Set(BENCHMARK_PRESETS.map((p) => p.id))
    return new Set(
      parsed.filter(
        (x): x is BenchmarkId =>
          typeof x === 'string' && allowed.has(x as BenchmarkId)
      )
    )
  } catch {
    return new Set()
  }
}

export function writeBenchIds(ids: Set<BenchmarkId>) {
  try {
    localStorage.setItem(LS_BENCH, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

export function readChartTab(): ChartTab | null {
  try {
    const stored = localStorage.getItem(LS_TAB)
    if (
      stored === 'allocation' ||
      stored === 'performance' ||
      stored === 'price'
    ) {
      return stored
    }
  } catch {
    // ignore
  }
  return null
}

export function writeChartTab(tab: ChartTab) {
  try {
    localStorage.setItem(LS_TAB, tab)
  } catch {
    // ignore
  }
}

export function readAllocPieMode(): AllocPieMode {
  try {
    const v = localStorage.getItem(LS_ALLOC_MODE)
    if (v === 'holding' || v === 'type') return v
  } catch {
    // ignore
  }
  return 'holding'
}

export function writeAllocPieMode(mode: AllocPieMode) {
  try {
    localStorage.setItem(LS_ALLOC_MODE, mode)
  } catch {
    // ignore
  }
}
