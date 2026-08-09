'use client'

/**
 * Assistant side panel — multi-agent chat only.
 * Analysis → Summary icon; holding news → Holdings icon.
 */

import { Button } from '@/components/ui/button'
import { Orbit, X } from 'lucide-react'
import { useAIInsightsSidebar } from './ai-insights/useAIInsightsSidebar'
import { PortfolioAnalystView } from './ai-insights/PortfolioAnalystView'

interface AIInsightsPanelProps {
  isAdmin?: boolean
}

export default function AIInsightsPanel({ isAdmin: _isAdmin = false }: AIInsightsPanelProps) {
  const { isOpen, close } = useAIInsightsSidebar()

  if (!isOpen) return null

  return (
    <div className="surface-panel panel-gold-grid panel-gold-grid--left fixed left-0 top-16 bottom-0 z-40 flex w-96 flex-col overflow-hidden border-r border-border shadow-xl">
      <div className="panel-gold-grid-bg" aria-hidden />
      <div className="panel-gold-grid-header relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-subtle px-4 pb-5 pt-4">
        <h2 className="section-title flex items-center gap-2">
          <Orbit className="h-4 w-4 text-gold" aria-hidden />
          <span className="section-title-accent">Assistant</span>
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          className="group h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
          aria-label="Close assistant"
        >
          <X className="h-4 w-4 transition-transform group-hover:scale-110" />
        </Button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
        <PortfolioAnalystView />
      </div>
    </div>
  )
}
