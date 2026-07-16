'use client'

import { useState } from 'react'
import { generatePortfolioInsights } from '@/app/actions/ai/portfolio-insights/generatePortfolioInsights'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'

export interface PortfolioAnalysisState {
  insights: string[] | null
  error: string | null
  cachedAt: string | null
  isLoading: boolean
  lastAnalysisMessage: string | null
}

export function usePortfolioAnalysis() {
  const [insights, setInsights] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastAnalysisMessage, setLastAnalysisMessage] = useState<string | null>(null)

  const reset = () => {
    setInsights(null)
    setError(null)
    setCachedAt(null)
    setLastAnalysisMessage(null)
  }

  /**
   * Loads any previously saved analysis without calling the AI.
   * Shows a loading state while fetching from Supabase.
   */
  const loadInitialAnalysis = async () => {
    setIsLoading(true)
    setError(null)
    reset()

    try {
      const latest = await getLatestAIInsightForCurrentUser('portfolio_insights')
      if (latest) {
        const insightsArr = Array.isArray(latest.result.insights)
          ? latest.result.insights
          : [latest.result.insights].filter(Boolean)
        setInsights(insightsArr)
        setCachedAt(latest.createdAt)
      }
    } catch {
      // ignore - we'll show the prompt to analyze after loading completes
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Triggers a fresh analysis (or re-analysis).
   */
  const performAnalysis = async () => {
    setIsLoading(true)
    setError(null)
    setLastAnalysisMessage(null)
    // Keep previous insights visible while loading new ones
    setCachedAt(null)

    try {
      const result = await generatePortfolioInsights()
      if ('error' in result && result.error) {
        setError(result.error)
        setCachedAt(null)
        setLastAnalysisMessage(null)
      } else if ('insights' in result && result.insights) {
        const insightsArr = Array.isArray(result.insights)
          ? result.insights
          : [result.insights].filter(Boolean)
        setInsights(insightsArr)
        setCachedAt(result.cachedAt ?? null)

        // Capture message from backend (e.g. "portfolio unchanged")
        if ('message' in result && typeof result.message === 'string') {
          setLastAnalysisMessage(result.message)
        } else {
          setLastAnalysisMessage(null)
        }
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLastAnalysisMessage(null)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    insights,
    error,
    cachedAt,
    isLoading,
    lastAnalysisMessage,
    loadInitialAnalysis,
    performAnalysis,
    reset,
  }
}
