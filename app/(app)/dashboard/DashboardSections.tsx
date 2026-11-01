'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { SegmentedControl } from './holdings/SegmentedControl'
import {
  dashboardTabOptions,
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

function sectionInView(ids: DashboardTab[]): DashboardTab {
  const line = 96
  let current = ids[0] ?? 'holdings'
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) continue
    if (el.getBoundingClientRect().top - line <= 8) current = id
  }
  const scrollHeight = document.documentElement.scrollHeight
  const canScroll = scrollHeight > window.innerHeight + 4
  const atBottom = window.innerHeight + window.scrollY >= scrollHeight - 4
  if (canScroll && atBottom) return ids[ids.length - 1] ?? current
  return current
}

function SectionControl({
  options,
  onPick,
}: {
  options: { value: DashboardTab; label: string }[]
  onPick: (tab: DashboardTab) => void
}) {
  const { tab } = useDashboardLayout()
  return (
    <div className="sticky top-16 z-40 mb-6 py-2">
      <SegmentedControl
        options={options}
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
  perps,
  charts,
  watchlist,
  transactions,
}: {
  summary: ReactNode
  holdings: ReactNode
  perps: ReactNode
  charts: ReactNode
  watchlist: ReactNode
  transactions: ReactNode
}) {
  const { layout, tab, perpsAvailable, setTab, setPerpsAvailable } = useDashboardLayout()
  const options = useMemo(
    () => dashboardTabOptions(perpsAvailable === true),
    [perpsAvailable]
  )
  const scrollingTo = useRef<DashboardTab | null>(null)

  useEffect(() => {
    return () => setPerpsAvailable(null)
  }, [setPerpsAvailable])

  useEffect(() => {
    if (layout !== 'all') return
    const id = tabFromHash(window.location.hash)
    if (!id || !options.some((option) => option.value === id)) return
    scrollingTo.current = id
    const timer = window.setTimeout(() => scrollToSection(id, false), 50)
    const clear = window.setTimeout(() => {
      scrollingTo.current = null
    }, 400)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(clear)
    }
  }, [layout, perpsAvailable])

  useEffect(() => {
    if (layout !== 'all') return
    let frame = 0
    const apply = () => {
      frame = 0
      if (scrollingTo.current) return
      const ids = options.map((option) => option.value)
      const next = sectionInView(ids)
      if (next !== tab) setTab(next, 'replace')
    }
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(apply)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [layout, tab, perpsAvailable, setTab, options])

  const pick = (next: DashboardTab, smooth: boolean) => {
    scrollingTo.current = next
    setTab(next)
    if (smooth) requestAnimationFrame(() => scrollToSection(next, true))
    const stop = () => {
      scrollingTo.current = null
    }
    window.addEventListener('scrollend', stop, { once: true })
    window.setTimeout(stop, 800)
  }

  if (layout === 'all') {
    return (
      <>
        {summary}
        <SectionControl options={options} onPick={(next) => pick(next, true)} />
        {holdings}
        {perps}
        {charts}
        {watchlist}
        {transactions}
      </>
    )
  }

  return (
    <>
      {summary}
      <SectionControl options={options} onPick={(next) => pick(next, false)} />
      <div hidden={tab !== 'holdings'}>
        {holdings}
        {charts}
      </div>
      <div hidden={tab !== 'perps'}>{perps}</div>
      <div hidden={tab !== 'watchlist'}>{watchlist}</div>
      <div hidden={tab !== 'transactions'}>{transactions}</div>
    </>
  )
}
