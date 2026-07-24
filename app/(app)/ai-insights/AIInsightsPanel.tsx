'use client'

import { useState, useEffect } from 'react'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import { HOLDING_NEWS_FEATURE_TYPE } from '@/app/actions/ai/holding-news/newsUtils'
import { Button } from '@/components/ui/button'
import { Sparkles, X, Loader2 } from 'lucide-react'

import { useAIInsightsSidebar } from './ai-insights/useAIInsightsSidebar'
import { usePortfolioAnalysis } from './ai-insights/usePortfolioAnalysis'
import { useHoldingNews } from './ai-insights/useHoldingNews'
import { AIInsightsMenu } from './ai-insights/AIInsightsMenu'
import { PortfolioAnalysisView } from './ai-insights/PortfolioAnalysisView'
import { PortfolioAnalystView } from './ai-insights/PortfolioAnalystView'
import { HoldingNewsView } from './ai-insights/HoldingNewsView'
import { PlaceholderView } from './ai-insights/PlaceholderView'
import { formatRelativeTime } from './ai-insights/utils'

type View = 'menu' | 'analyst' | 'portfolio' | 'holding-news' | 'placeholder'

interface AIInsightsPanelProps {
  /** Admins skip AI cooldowns (including holding-news refresh button). */
  isAdmin?: boolean
}

export default function AIInsightsPanel({ isAdmin = false }: AIInsightsPanelProps) {
  const { isOpen, close } = useAIInsightsSidebar()
  const portfolio = usePortfolioAnalysis()
  const holdingNews = useHoldingNews()

  const [view, setView] = useState<View>('menu')
  const [placeholderTitle, setPlaceholderTitle] = useState('')
  const [portfolioAnalysisTimestamp, setPortfolioAnalysisTimestamp] = useState<string | null>(null)
  const [holdingNewsTimestamp, setHoldingNewsTimestamp] = useState<string | null>(null)
  const [isFetchingTimestamp, setIsFetchingTimestamp] = useState(false)

  // Reset internal state when sidebar closes
  useEffect(() => {
    if (!isOpen) {
      setView('menu')
      setPlaceholderTitle('')
      portfolio.reset()
      holdingNews.reset()
    }
  }, [isOpen, portfolio, holdingNews])

  // When the sidebar opens, make sure we start on the menu
  useEffect(() => {
    if (isOpen) {
      setView('menu')
    }
  }, [isOpen])

  // Fetch timestamps for portfolio analysis and holding news when sidebar opens.
  useEffect(() => {
    if (isOpen) {
      setIsFetchingTimestamp(true)
      Promise.all([
        getLatestAIInsightForCurrentUser('portfolio_insights'),
        getLatestAIInsightForCurrentUser(HOLDING_NEWS_FEATURE_TYPE),
      ])
        .then(([portfolioLatest, newsLatest]) => {
          setPortfolioAnalysisTimestamp(portfolioLatest?.createdAt ?? null)
          setHoldingNewsTimestamp(newsLatest?.createdAt ?? null)
        })
        .catch(() => {
          setPortfolioAnalysisTimestamp(null)
          setHoldingNewsTimestamp(null)
        })
        .finally(() => setIsFetchingTimestamp(false))
    } else {
      setPortfolioAnalysisTimestamp(null)
      setHoldingNewsTimestamp(null)
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

  const openAnalyst = () => {
    setView('analyst')
  }

  const openPortfolio = () => {
    setView('portfolio')
    portfolio.loadInitialAnalysis()
  }

  const openHoldingNews = () => {
    setView('holding-news')
    holdingNews.loadInitialNews()
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
    <div className="surface-panel fixed left-0 top-16 bottom-0 z-40 flex w-96 flex-col overflow-hidden border-r border-border shadow-xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-subtle bg-card px-4 pb-3 pt-4">
        <h2 className="section-title">
          <span className="section-title-accent">AI Insights</span>
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={closePanel}
          className="group h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
          aria-label="Close AI Insights panel"
        >
          <X className="h-4 w-4 transition-transform group-hover:scale-110" />
        </Button>
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
                onOpenAnalyst={openAnalyst}
                onOpenPortfolio={openPortfolio}
                onOpenHoldingNews={openHoldingNews}
                onOpenPlaceholder={openPlaceholder}
                portfolioAnalysisTimestamp={portfolioAnalysisTimestamp}
                holdingNewsTimestamp={holdingNewsTimestamp}
              />
            )}

            {view === 'analyst' && (
              <PortfolioAnalystView onBack={backToMenu} />
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

            {view === 'holding-news' && (
              <HoldingNewsView
                news={holdingNews.news}
                impact={holdingNews.impact}
                error={holdingNews.error}
                cachedAt={holdingNews.cachedAt}
                contentFetchedAt={holdingNews.contentFetchedAt}
                lastCheckedAt={holdingNews.lastCheckedAt}
                isLoading={holdingNews.isLoading}
                lastMessage={holdingNews.lastMessage}
                nextRefreshAt={holdingNews.nextRefreshAt}
                windowFrom={holdingNews.windowFrom}
                windowTo={holdingNews.windowTo}
                isAdmin={isAdmin}
                onBack={backToMenu}
                onFetch={async () => {
                  await holdingNews.fetchFreshNews()
                  // Refresh timestamp after fetch
                  try {
                    const latest = await getLatestAIInsightForCurrentUser(HOLDING_NEWS_FEATURE_TYPE)
                    setHoldingNewsTimestamp(latest?.createdAt ?? null)
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
    </div>
  )
}
