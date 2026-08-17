import type { SnapshotPoint } from '@/lib/aggregateSnapshots'

export type AlignedPair = { date: string; a: number; b: number }

/** Intersection of two series by date. No fill-forward. */
export function alignSeries(
  a: SnapshotPoint[],
  b: SnapshotPoint[]
): AlignedPair[] {
  if (a.length === 0 || b.length === 0) return []
  const bByDate = new Map<string, number>()
  for (const p of b) {
    if (Number.isFinite(p.marketValue)) bByDate.set(p.date, p.marketValue)
  }
  const out: AlignedPair[] = []
  for (const p of a) {
    const bv = bByDate.get(p.date)
    if (bv == null || !Number.isFinite(p.marketValue)) continue
    out.push({ date: p.date, a: p.marketValue, b: bv })
  }
  return out
}

/** Keep points whose date is within [start, end] inclusive (YYYY-MM-DD). */
export function clipToDateRange(
  points: SnapshotPoint[],
  start: string,
  end: string
): SnapshotPoint[] {
  return points.filter((p) => p.date >= start && p.date <= end)
}
