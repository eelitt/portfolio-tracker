import { describe, it, expect } from 'vitest'
import {
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
    expect(parseDashboardTab('nope')).toBe('holdings')
  })

  it('reads tab from hash', () => {
    expect(tabFromHash('#watchlist')).toBe('watchlist')
    expect(tabFromHash('transactions')).toBe('transactions')
    expect(tabFromHash('#nope')).toBe(null)
  })
})
