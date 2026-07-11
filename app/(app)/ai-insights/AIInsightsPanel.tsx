'use client'

import { useState, useEffect } from 'react'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai'
import { Button } from '@/components/ui/button'
import { Sparkles, X, Loader2 } from 'lucide-react'

import { useAIInsightsSidebar } from './ai-insights/useAIInsightsSidebar'
import { usePortfolioAnalysis } from './ai-insights/usePortfolioAnalysis'
import { AIInsightsMenu } from './ai-insights/AIInsightsMenu'
import { PortfolioAnalysisView } from './ai-insights/PortfolioAnalysisView'
import { PlaceholderView } from './ai-insights/PlaceholderView'
import { formatRelativeTime } from './ai-insights/utils'

type View = 'menu' | 'portfolio' | 'placeholder'

export default function AIInsightsPanel() {
  const { isOpen, close } = useAIInsightsSidebar()
  const portfolio = usePortfolioAnalysis()

  const [view, setView] = useState<View>('menu')
  const [placeholderTitle, setPlaceholderTitle] = useState('')
  const [portfolioAnalysisTimestamp, setPortfolioAnalysisTimestamp] = useState<string | null>(null)
  const [isFetchingTimestamp, setIsFetchingTimestamp] = useState(false)

  // Reset internal state when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setView('menu')
      setPlaceholderTitle('')
      portfolio.reset()
    }
  }, [isOpen, portfolio])

  // When the sidebar opens, make sure we start on the menu
  useEffect(() => {
    if (isOpen) {
      setView('menu')
    }
  }, [isOpen])

  // Fetch timestamp of latest portfolio analysis (if any) when sidebar opens.
  // We use a loading state so the menu doesn't flash the "UNUSED" ribbon
  // while we check if the user has previously run an analysis.
  useEffect(() => {
    if (isOpen) {
      setIsFetchingTimestamp(true)
      getLatestAIInsightForCurrentUser('portfolio_insights')
        .then((latest) => setPortfolioAnalysisTimestamp(latest?.createdAt ?? null))
        .catch(() => setPortfolioAnalysisTimestamp(null))
        .finally(() => setIsFetchingTimestamp(false))
    } else {
      setPortfolioAnalysisTimestamp(null)
      setIsFetchingTimestamp(false)
    }
  }, [isOpen])

  const closePanel = () => {
    close()
    setView('menu')
    setPlaceholderTitle('')
    portfolio.reset()
  }

  const resetToMenu = () => {
    setView('menu')
    setPlaceholderTitle('')
    portfolio.reset()
  }

  const openPortfolio = () => {
    setView('portfolio')
    portfolio.loadInitialAnalysis()
  }

  const openPlaceholder = (title: string) => {
    setPlaceholderTitle(title)
    setView('placeholder')
  }

  const backToMenu = () => {
    resetToMenu()
  }

  if (!isOpen) return null

  return (
    <div className="fixed left-0 top-16 bottom-0 w-96 bg-muted dark:bg-slate-800 shadow-xl z-40 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">AI Insights</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={closePanel}
          className="group h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
          aria-label="Close AI Insights panel"
        >
          <X className="h-4 w-4 transition-transform group-hover:scale-110" />
        </Button>
      </div>

      {isFetchingTimestamp ? (
        // Show loading spinner while we fetch whether the user has previously
        // run an analysis. This prevents flashing the "UNUSED" ribbon in the
        // menu when the panel is opened from the navbar (even if analysis exists).
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          {view === 'menu' && (
            <AIInsightsMenu
              onOpenPortfolio={openPortfolio}
              onOpenPlaceholder={openPlaceholder}
              portfolioAnalysisTimestamp={portfolioAnalysisTimestamp}
            />
          )}

          {view === 'portfolio' && (
            <PortfolioAnalysisView
              insights={portfolio.insights}
              error={portfolio.error}
              cachedAt={portfolio.cachedAt}
              isLoading={portfolio.isLoading}
              lastAnalysisMessage={portfolio.lastAnalysisMessage}
              onBack={backToMenu}
              onAnalyze={async () => {
                await portfolio.performAnalysis()
                // Refresh the timestamp after a successful analysis
                try {
                  const latest = await getLatestAIInsightForCurrentUser('portfolio_insights')
                  setPortfolioAnalysisTimestamp(latest?.createdAt ?? null)
                } catch {
                  // ignore
                }
              }}
              formatRelativeTime={formatRelativeTime}
            />
          )}

          {view === 'placeholder' && (
            <PlaceholderView
              title={placeholderTitle}
              onBack={backToMenu}
            />
          )}
        </>
      )}
    </div>
  )
}
