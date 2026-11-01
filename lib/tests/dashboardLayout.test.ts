import { describe, it, expect } from 'vitest'
import {
  dashboardTabOptions,
  parseDashboardLayout,
  parseDashboardTab,
  tabFromHash,
} from '../dashboardLayout'

describe('dashboardLayout helpers', () => {
  it('defaults layout to all', () => {
    expect(parseDashboardLayout(null)).toBe('all')
    expect(parseDashboardLayout('focus')).toBe('focus')
    expect(parseDashboardLayout('nope')).toBe('all')
  })

  it('defaults tab to holdings', () => {
    expect(parseDashboardTab(null)).toBe('holdings')
    expect(parseDashboardTab('watchlist')).toBe('watchlist')
    expect(parseDashboardTab('transactions')).toBe('transactions')
    expect(parseDashboardTab('perps')).toBe('perps')
    expect(parseDashboardTab('nope')).toBe('holdings')
  })

  it('reads tab from hash', () => {
    expect(tabFromHash('#watchlist')).toBe('watchlist')
    expect(tabFromHash('transactions')).toBe('transactions')
    expect(tabFromHash('#perps')).toBe('perps')
    expect(tabFromHash('#nope')).toBe(null)
  })

  it('puts Perps between Holdings and Watchlist only when that section exists', () => {
    expect(dashboardTabOptions(false).map((tab) => tab.value)).toEqual([
      'holdings',
      'watchlist',
      'transactions',
    ])
    expect(dashboardTabOptions(true).map((tab) => tab.label)).toEqual([
      'Holdings',
      'Perps',
      'Watchlist',
      'Transactions',
    ])
  })
})
