/** Geometric CAGR from first → last close over `years`. */
export function priceCagr(
  firstClose: number,
  lastClose: number,
  years: number
): number | null {
  if (!(firstClose > 0) || !(lastClose > 0) || !(years > 0)) return null
  const cagr = Math.pow(lastClose / firstClose, 1 / years) - 1
  return Number.isFinite(cagr) ? cagr : null
}

/** Years between two UTC calendar days (inclusive span via day count / 365.25). */
export function yearsBetween(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${endIso.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0
  return (b - a) / (365.25 * 24 * 60 * 60 * 1000)
}

/**
 * Planning rate from a historic print: −2pp haircut, floor 0%. No upper cap.
 */
export function planningRateFromCagr(rawCagr: number): number {
  if (!Number.isFinite(rawCagr)) return 0
  return Math.max(rawCagr - 0.02, 0)
}
