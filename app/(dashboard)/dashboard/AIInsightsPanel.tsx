'use client'

import { useState, useEffect } from 'react'
import { generateAIInsights } from '@/app/actions/generateAIInsights'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sparkles, Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

export default function AIInsightsPanel() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'portfolio' | 'placeholder'>('menu')
  const [placeholderTitle, setPlaceholderTitle] = useState('')
  const [insights, setInsights] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Listen for navbar button
  useEffect(() => {
    const handleOpen = () => {
      setOpen(true)
      resetToMenu()
    }
    window.addEventListener('open-ai-insights', handleOpen)
    return () => window.removeEventListener('open-ai-insights', handleOpen)
  }, [])

  const resetToMenu = () => {
    setView('menu')
    setInsights(null)
    setError(null)
    setPlaceholderTitle('')
  }

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) {
      // Reset when closing
      setTimeout(resetToMenu, 200)
    }
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
      } else if ('insights' in result && result.insights) {
        setInsights(result.insights)
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Insights
          </DialogTitle>
        </DialogHeader>

        {view === 'menu' && (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Choose what you'd like help with:
            </p>

            <div className="space-y-3">
              {/* Portfolio Analysis - Real feature */}
              <button
                onClick={loadPortfolioAnalysis}
                className="w-full text-left border rounded-lg p-4 hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="w-full text-left border rounded-lg p-4 hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring opacity-75"
              >
                <div className="font-medium">Goal Suggestions</div>
                <p className="text-sm text-muted-foreground mt-1">
                  See realistic goals based on your portfolio
                </p>
                <div className="mt-2 text-[10px] text-muted-foreground">Coming soon</div>
              </button>

              <button
                onClick={() => openPlaceholder('Rebalancing Advice')}
                className="w-full text-left border rounded-lg p-4 hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring opacity-75"
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
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {insights}
                </div>

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
      </DialogContent>
    </Dialog>
  )
}
