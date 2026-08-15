'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DASHBOARD_LAYOUT_KEY,
  DASHBOARD_TAB_KEY,
  parseDashboardLayout,
  parseDashboardTab,
  tabFromHash,
  type DashboardLayoutMode,
  type DashboardTab,
} from '@/lib/dashboardLayout'

type DashboardLayoutContextValue = {
  layout: DashboardLayoutMode
  tab: DashboardTab
  setLayout: (mode: DashboardLayoutMode) => void
  setTab: (tab: DashboardTab) => void
}

const DashboardLayoutContext =
  createContext<DashboardLayoutContextValue | null>(null)

export function DashboardLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayoutState] = useState<DashboardLayoutMode>('all')
  const [tab, setTabState] = useState<DashboardTab>('holdings')

  useEffect(() => {
    try {
      const storedLayout = parseDashboardLayout(
        localStorage.getItem(DASHBOARD_LAYOUT_KEY)
      )
      const fromHash = tabFromHash(window.location.hash)
      const storedTab = parseDashboardTab(localStorage.getItem(DASHBOARD_TAB_KEY))
      const nextTab = fromHash ?? storedTab
      setLayoutState(storedLayout)
      setTabState(nextTab)
      if (fromHash) {
        localStorage.setItem(DASHBOARD_TAB_KEY, fromHash)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const onHash = () => {
      const next = tabFromHash(window.location.hash)
      if (!next) return
      setTabState(next)
      try {
        localStorage.setItem(DASHBOARD_TAB_KEY, next)
      } catch {
        // ignore
      }
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  const setLayout = useCallback((mode: DashboardLayoutMode) => {
    setLayoutState(mode)
    try {
      localStorage.setItem(DASHBOARD_LAYOUT_KEY, mode)
    } catch {
      // ignore
    }
  }, [])

  const setTab = useCallback((next: DashboardTab) => {
    setTabState(next)
    try {
      localStorage.setItem(DASHBOARD_TAB_KEY, next)
    } catch {
      // ignore
    }
    const hash = `#${next}`
    if (window.location.hash !== hash) {
      const url = `${window.location.pathname}${window.location.search}${hash}`
      history.pushState(null, '', url)
    }
  }, [])

  const value = useMemo(
    () => ({ layout, tab, setLayout, setTab }),
    [layout, tab, setLayout, setTab]
  )

  return (
    <DashboardLayoutContext.Provider value={value}>
      {children}
    </DashboardLayoutContext.Provider>
  )
}

export function useDashboardLayout(): DashboardLayoutContextValue {
  const ctx = useContext(DashboardLayoutContext)
  if (!ctx) {
    return {
      layout: 'all',
      tab: 'holdings',
      setLayout: () => {},
      setTab: () => {},
    }
  }
  return ctx
}
