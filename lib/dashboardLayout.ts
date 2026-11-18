/** Client-safe dashboard layout preference (localStorage). */

export const DASHBOARD_LAYOUT_KEY = 'dashboardLayout'
export const DASHBOARD_TAB_KEY = 'dashboardTab'

export type DashboardLayoutMode = 'all' | 'focus'
export type DashboardTab =
  | 'summary'
  | 'holdings'
  | 'perps'
  | 'charts'
  | 'watchlist'
  | 'transactions'

/** Perps sits between Holdings and Charts only while that section is on the page. */
export function dashboardTabOptions(includePerps: boolean): {
  value: DashboardTab
  label: string
}[] {
  return [
    { value: 'summary', label: 'Summary' },
    { value: 'holdings', label: 'Holdings' },
    ...(includePerps ? [{ value: 'perps' as const, label: 'Perps' }] : []),
    { value: 'charts', label: 'Charts' },
    { value: 'watchlist', label: 'Watchlist' },
    { value: 'transactions', label: 'Transactions' },
  ]
}

export function parseDashboardLayout(
  raw: string | null | undefined
): DashboardLayoutMode {
  return raw === 'focus' ? 'focus' : 'all'
}

export function parseDashboardTab(
  raw: string | null | undefined
): DashboardTab {
  if (
    raw === 'summary' ||
    raw === 'holdings' ||
    raw === 'perps' ||
    raw === 'charts' ||
    raw === 'watchlist' ||
    raw === 'transactions'
  ) {
    return raw
  }
  return 'holdings'
}

export function tabFromHash(hash: string): DashboardTab | null {
  const id = hash.replace(/^#/, '')
  if (
    id === 'summary' ||
    id === 'holdings' ||
    id === 'perps' ||
    id === 'charts' ||
    id === 'watchlist' ||
    id === 'transactions'
  ) {
    return id
  }
  return null
}
