/**
 * Overview prefers the date window. An empty window falls back to the latest rows
 * so the tab still matches Runs when nothing landed in the last N days.
 */
export function pickOverviewRows<T>(
  windowRows: T[],
  latestRows: T[]
): { rows: T[]; outsideWindow: boolean } {
  if (windowRows.length > 0) {
    return { rows: windowRows, outsideWindow: false }
  }
  return { rows: latestRows, outsideWindow: latestRows.length > 0 }
}
