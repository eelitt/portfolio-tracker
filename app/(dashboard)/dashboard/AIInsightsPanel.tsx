'use client'

import { useState, useEffect } from 'react'
import { generateAIInsights } from '@/app/actions/generateAIInsights'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2, ArrowLeft, X } from 'lucide-react'

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec} seconds ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
  const diffHours = Math.floor(diffMin / 60)
  return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
}

export default function AIInsightsPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'portfolio' | 'placeholder'>('menu')
  const [placeholderTitle, setPlaceholderTitle] = useState('')
  const [insights, setInsights] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const handleToggle = () => {
      const open = localStorage.getItem('aiInsightsSidebarOpen') === 'true'
      setIsOpen(open)
      if (open) {
        resetToMenu()
      }
    }
    window.addEventListener('ai-insights-toggle', handleToggle)

    const initial = localStorage.getItem('aiInsightsSidebarOpen') === 'true'
    setIsOpen(initial)
    if (initial) {
      resetToMenu()
    }

    return () => window.removeEventListener('ai-insights-toggle', handleToggle)
  }, [])

  const resetToMenu = () => {
    setView('menu')
    setInsights(null)
    setError(null)
    setCachedAt(null)
    setPlaceholderTitle('')
  }

  const closePanel = () => {
    localStorage.setItem('aiInsightsSidebarOpen', 'false')
    setIsOpen(false)
    resetToMenu()
  }

  const loadPortfolioAnalysis = async () => {
    setView('portfolio')
    setIsLoading(true)
    setError(null)
    setInsights(null)

    try {
      const result = await generateAIInsights('portfolio_insights')
      if ('error' in result && result.error) {
        setError(result.error)
        setCachedAt(null)
      } else if ('insights' in result && result.insights) {
        setInsights(Array.isArray(result.insights) ? result.insights : [result.insights].filter(Boolean))
        setCachedAt(result.cachedAt ?? null)
      }
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
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

      {view === 'menu' && (
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Choose what you'd like help with:
          </p>

          <div className="space-y-3">
            {/* Portfolio Analysis - Real feature */}
            <button
              onClick={loadPortfolioAnalysis}
              className="w-full text-left border rounded-lg p-4 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Portfolio Analysis
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Get a professional summary of your current holdings and performance
              </p>
            </button>

            {/* Placeholders */}
            <button
              onClick={() => openPlaceholder('Goal Suggestions')}
              className="w-full text-left border rounded-lg p-4 bg-card shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-accent/60 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring opacity-75"
            >
              <div className="font-medium">Goal Suggestions</div>
              <p className="text-sm text-muted-foreground mt-1">
                See realistic goals based on your portfolio
              </p>
              <div className="mt-2 text-[10px] text-muted-foreground">Coming soon</div>
            </button>

            <button
              onClick={() => openPlaceholder('Rebalancing Advice')}
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
      )}

      {view === 'portfolio' && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={backToMenu}
              className="h-8 px-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <span className="text-sm font-medium">Portfolio Analysis</span>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing your portfolio...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
              {error}
            </div>
          )}

          {insights && (
            <div className="space-y-4">
              {cachedAt && (
                <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 p-2 rounded">
                  Cached result from {formatRelativeTime(cachedAt)}. 
                  You can request a fresh analysis after the cooldown.
                </div>
              )}

              <ul className="list-disc pl-5 space-y-1 text-sm leading-relaxed">
                {insights.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>

              <div className="text-xs text-muted-foreground bg-muted p-3 rounded border">
                <strong>Disclaimer:</strong> This is AI-generated analysis for informational purposes only. 
                It is not financial advice. Consult a qualified advisor.
              </div>
            </div>
          )}

          {!isLoading && !error && !insights && (
            <div className="text-sm text-muted-foreground py-4">
              No results yet.
            </div>
          )}
        </div>
      )}

      {view === 'placeholder' && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={backToMenu}
              className="h-8 px-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <span className="text-sm font-medium">{placeholderTitle}</span>
          </div>

          <div className="py-8 text-center">
            <div className="text-sm text-muted-foreground mb-2">
              This feature is coming soon.
            </div>
            <p className="text-xs text-muted-foreground">
              We're working on more helpful AI tools for your portfolio.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
