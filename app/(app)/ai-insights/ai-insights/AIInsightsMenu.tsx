'use client'

import { Sparkles } from 'lucide-react'
import { formatRelativeTime } from './utils'

interface AIInsightsMenuProps {
  onOpenPortfolio: () => void
  onOpenPlaceholder: (title: string) => void
  portfolioAnalysisTimestamp?: string | null
}

export function AIInsightsMenu({
  onOpenPortfolio,
  onOpenPlaceholder,
  portfolioAnalysisTimestamp = null,
}: AIInsightsMenuProps) {
  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">
        Choose what you'd like help with:
      </p>

      <div className="space-y-3">
        {/* Portfolio Analysis - Real feature */}
        <button
          onClick={onOpenPortfolio}
          className="relative w-full text-left border rounded-lg p-4 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {!portfolioAnalysisTimestamp && (
            <div className="absolute top-1 right-1 flex items-center pointer-events-none z-10">
              <div className="bg-indigo-600 text-white text-[10px] font-semibold px-1.5 py-0.5 shadow-sm">
                UNUSED
              </div>
              <div className="w-0 h-0 border-t-[5px] border-b-[5px] border-l-[5px] border-transparent border-l-indigo-600" />
            </div>
          )}
          <div className="font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Portfolio Analysis
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Get a professional summary of your current holdings and performance
          </p>
          {portfolioAnalysisTimestamp && (
            <p className="text-xs text-muted-foreground mt-1">
              Last analyzed {formatRelativeTime(portfolioAnalysisTimestamp)}
            </p>
          )}
        </button>

        {/* Placeholders */}
        <button
          onClick={() => onOpenPlaceholder('Goal Suggestions')}
          className="w-full text-left border rounded-lg p-4 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring opacity-75"
        >
          <div className="font-medium">Goal Suggestions</div>
          <p className="text-sm text-muted-foreground mt-1">
            See realistic goals based on your portfolio
          </p>
          <div className="mt-2 text-[10px] text-muted-foreground">Coming soon</div>
        </button>

        <button
          onClick={() => onOpenPlaceholder('Rebalancing Advice')}
          className="w-full text-left border rounded-lg p-4 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring opacity-75"
        >
          <div className="font-medium">Rebalancing Advice</div>
          <p className="text-sm text-muted-foreground mt-1">
            Get suggestions on how to improve your allocation
          </p>
          <div className="mt-2 text-[10px] text-muted-foreground">Coming soon</div>
        </button>
      </div>
    </div>
  )
}
