/** Client-safe dashboard layout preference (localStorage). */

export const DASHBOARD_LAYOUT_KEY = 'dashboardLayout'
export const DASHBOARD_TAB_KEY = 'dashboardTab'

export type DashboardLayoutMode = 'all' | 'focus'
export type DashboardTab = 'holdings' | 'watchlist' | 'transactions'

export const DASHBOARD_TAB_OPTIONS: {
  value: DashboardTab
  label: string
}[] = [
  { value: 'holdings', label: 'Holdings' },
  { value: 'watchlist', label: 'Watchlist' },
  { value: 'transactions', label: 'Transactions' },
]

export function parseDashboardLayout(
  raw: string | null | undefined
): DashboardLayoutMode {
  return raw === 'focus' ? 'focus' : 'all'
}

export function parseDashboardTab(
  raw: string | null | undefined
): DashboardTab {
  if (raw === 'watchlist' || raw === 'transactions' || raw === 'holdings') {
    return raw
  }
  return 'holdings'
}

export function tabFromHash(hash: string): DashboardTab | null {
  const id = hash.replace(/^#/, '')
  if (id === 'holdings' || id === 'watchlist' || id === 'transactions') {
    return id
  }
  return null
}
