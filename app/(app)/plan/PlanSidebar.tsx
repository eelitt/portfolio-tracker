'use client'

import { useEffect, useState } from 'react'
import { getUserGoals } from '@/app/actions/goals'
import type { AllocationWorkspaceData } from '@/app/actions/allocation'
import type { PreferredCurrency } from '@/lib/userTypes'
import { Goal } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { SegmentedControl } from '@/app/(app)/dashboard/holdings/SegmentedControl'
import {
  PORTFOLIO_VALUE_EVENT,
  type PortfolioValueDetail,
} from '@/app/(app)/dashboard/summary/PortfolioValueSync'
import GoalsPanel from './GoalsPanel'
import AllocationPanel from './AllocationPanel'

const OPEN_KEY = 'planSidebarOpen'
const LEGACY_OPEN_KEY = 'goalsSidebarOpen'
const TAB_KEY = 'planSidebarTab'
const TOGGLE_EVENT = 'plan-sidebar-toggle'
const LEGACY_TOGGLE = 'goals-sidebar-toggle'

type PlanTab = 'goals' | 'allocation'

function readOpen(): boolean {
  const next = localStorage.getItem(OPEN_KEY)
  if (next !== null) return next === 'true'
  return localStorage.getItem(LEGACY_OPEN_KEY) === 'true'
}

export default function PlanSidebar({
  preferredCurrency = 'USD',
  initialGoals = [],
  initialPortfolioValue = 0,
  initialWorkspace,
  initialCanSuggestMix = false,
}: {
  preferredCurrency?: PreferredCurrency
  initialGoals?: Goal[]
  initialPortfolioValue?: number
  initialWorkspace?: AllocationWorkspaceData
  initialCanSuggestMix?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<PlanTab>('goals')
  const [goals, setGoals] = useState<Goal[]>(initialGoals)
  const [portfolioValue, setPortfolioValue] = useState(initialPortfolioValue)

  const loadGoals = async () => {
    setGoals(await getUserGoals())
  }

  useEffect(() => {
    const applyOpen = () => setIsOpen(readOpen())
    const handleToggle = () => applyOpen()

    const handlePortfolioValue = (e: Event) => {
      const detail = (e as CustomEvent<PortfolioValueDetail>).detail
      if (!detail || typeof detail.value !== 'number') return
      setPortfolioValue(detail.value)
    }

    window.addEventListener(TOGGLE_EVENT, handleToggle)
    window.addEventListener(LEGACY_TOGGLE, handleToggle)
    window.addEventListener(PORTFOLIO_VALUE_EVENT, handlePortfolioValue)

    applyOpen()
    const storedTab = localStorage.getItem(TAB_KEY)
    if (storedTab === 'goals' || storedTab === 'allocation') setTab(storedTab)

    return () => {
      window.removeEventListener(TOGGLE_EVENT, handleToggle)
      window.removeEventListener(LEGACY_TOGGLE, handleToggle)
      window.removeEventListener(PORTFOLIO_VALUE_EVENT, handlePortfolioValue)
    }
  }, [])

  const closeSidebar = () => {
    localStorage.setItem(OPEN_KEY, 'false')
    setIsOpen(false)
  }

  const changeTab = (next: PlanTab) => {
    setTab(next)
    localStorage.setItem(TAB_KEY, next)
  }

  return (
    <div
      hidden={!isOpen}
      className="surface-panel panel-gold-grid panel-gold-grid--right fixed right-0 top-16 bottom-0 z-40 flex w-80 flex-col overflow-hidden border-l border-border shadow-xl"
    >
      <div className="panel-gold-grid-bg" aria-hidden />
      <div className="panel-gold-grid-header relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-subtle px-4 pb-4 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={closeSidebar}
            className="group h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
            aria-label="Close plan sidebar"
          >
            <X className="h-4 w-4 transition-transform group-hover:scale-110" />
          </Button>
          <h2 className="section-title">
            <span className="section-title-accent">Plan</span>
          </h2>
        </div>
      </div>

      <div className="relative z-10 px-4 pt-3">
        <SegmentedControl
          aria-label="Plan section"
          size="sm"
          value={tab}
          onChange={changeTab}
          options={[
            { value: 'goals', label: 'Goals' },
            { value: 'allocation', label: 'Allocation' },
          ]}
        />
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div hidden={tab !== 'goals'}>
          <GoalsPanel
            goals={goals}
            portfolioValue={portfolioValue}
            preferredCurrency={preferredCurrency}
            onChanged={loadGoals}
          />
        </div>
        <div hidden={tab !== 'allocation'}>
          <AllocationPanel
            preferredCurrency={preferredCurrency}
            initialWorkspace={initialWorkspace}
            initialCanSuggestMix={initialCanSuggestMix}
          />
        </div>
      </div>
    </div>
  )
}
