import type { SnapshotPoint } from '@/lib/aggregateSnapshots'

export type ContributionInput = {
  id: string
  label: string
  delta: number
}

export type ContributionRow = {
  id: string
  label: string
  delta: number
  /** Null when book Δ is ~0 — show $ Δ only. */
  sharePercent: number | null
}

const EPS = 1e-9

export function seriesDelta(points: SnapshotPoint[]): number | null {
  if (points.length < 2) return null
  const first = points[0].marketValue
  const last = points[points.length - 1].marketValue
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  return last - first
}

export function contributionFromDeltas(
  portfolioDelta: number,
  rows: ContributionInput[]
): ContributionRow[] {
  const meaningful =
    Number.isFinite(portfolioDelta) && Math.abs(portfolioDelta) > EPS
  const out: ContributionRow[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    delta: r.delta,
    sharePercent: meaningful ? (r.delta / portfolioDelta) * 100 : null,
  }))
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return out
}
