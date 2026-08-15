'use client'

import { useEffect, type ReactNode } from 'react'
import { SegmentedControl } from './holdings/SegmentedControl'
import {
  DASHBOARD_TAB_OPTIONS,
  tabFromHash,
  type DashboardTab,
} from '@/lib/dashboardLayout'
import { useDashboardLayout } from './DashboardLayoutProvider'

function scrollToSection(id: DashboardTab, smooth: boolean) {
  document.getElementById(id)?.scrollIntoView({
    behavior: smooth ? 'smooth' : 'auto',
    block: 'start',
  })
}

function SectionControl({
  onPick,
}: {
  onPick: (tab: DashboardTab) => void
}) {
  const { tab } = useDashboardLayout()
  return (
    <div className="sticky top-16 z-40 mb-6 py-2">
      <SegmentedControl
        options={DASHBOARD_TAB_OPTIONS}
        value={tab}
        onChange={(next) => onPick(next as DashboardTab)}
        aria-label="Dashboard section"
      />
    </div>
  )
}

export default function DashboardSections({
  summary,
  holdings,
  watchlist,
  transactions,
}: {
  summary: ReactNode
  holdings: ReactNode
  watchlist: ReactNode
  transactions: ReactNode
}) {
  const { layout, tab, setTab } = useDashboardLayout()

  useEffect(() => {
    if (layout !== 'all') return
    const id = tabFromHash(window.location.hash)
    if (!id) return
    const timer = window.setTimeout(() => scrollToSection(id, false), 50)
    return () => window.clearTimeout(timer)
  }, [layout])

  if (layout === 'all') {
    return (
      <>
        {summary}
        <SectionControl
          onPick={(next) => {
            setTab(next)
            requestAnimationFrame(() => scrollToSection(next, true))
          }}
        />
        {holdings}
        {watchlist}
        {transactions}
      </>
    )
  }

  return (
    <>
      {summary}
      <SectionControl onPick={setTab} />
      <div hidden={tab !== 'holdings'}>{holdings}</div>
      <div hidden={tab !== 'watchlist'}>{watchlist}</div>
      <div hidden={tab !== 'transactions'}>{transactions}</div>
    </>
  )
}
