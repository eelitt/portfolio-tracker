/** Client-safe dashboard layout preference (localStorage). */

export const DASHBOARD_LAYOUT_KEY = 'dashboardLayout'
export const DASHBOARD_TAB_KEY = 'dashboardTab'

export type DashboardLayoutMode = 'all' | 'focus'
export type DashboardTab = 'holdings' | 'perps' | 'watchlist' | 'transactions'

/** Perps sits between Holdings and Watchlist only while that section is on the page. */
export function dashboardTabOptions(includePerps: boolean): {
  value: DashboardTab
  label: string
}[] {
  return [
    { value: 'holdings', label: 'Holdings' },
    ...(includePerps ? [{ value: 'perps' as const, label: 'Perps' }] : []),
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
    raw === 'watchlist' ||
    raw === 'transactions' ||
    raw === 'holdings' ||
    raw === 'perps'
  ) {
    return raw
  }
  return 'holdings'
}

export function tabFromHash(hash: string): DashboardTab | null {
  const id = hash.replace(/^#/, '')
  if (
    id === 'holdings' ||
    id === 'perps' ||
    id === 'watchlist' ||
    id === 'transactions'
  ) {
    return id
  }
  return null
}
