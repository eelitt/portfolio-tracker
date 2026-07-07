'use client'

import { useState } from 'react'
import { generateAIInsights } from '@/app/actions/generateAIInsights'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai'

export interface PortfolioAnalysisState {
  insights: string[] | null
  error: string | null
  cachedAt: string | null
  isLoading: boolean
}

export function usePortfolioAnalysis() {
  const [insights, setInsights] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const reset = () => {
    setInsights(null)
    setError(null)
    setCachedAt(null)
  }

  /**
   * Loads any previously saved analysis without calling the AI.
   * If none exists, leaves the state empty so the caller can show a "start analysis" prompt.
   */
  const loadInitialAnalysis = async () => {
    setIsLoading(false)
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
        return true // had previous
      }
    } catch {
      // ignore - we'll just show the prompt to analyze
    }

    return false // no previous analysis
  }

  /**
   * Triggers a fresh analysis (or re-analysis).
   */
  const performAnalysis = async () => {
    setIsLoading(true)
    setError(null)
    // Keep previous insights visible while loading new ones
    setCachedAt(null)

    try {
      const result = await generateAIInsights('portfolio_insights')
      if ('error' in result && result.error) {
        setError(result.error)
        setCachedAt(null)
      } else if ('insights' in result && result.insights) {
        const insightsArr = Array.isArray(result.insights)
          ? result.insights
          : [result.insights].filter(Boolean)
        setInsights(insightsArr)
        setCachedAt(result.cachedAt ?? null)
      }
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    insights,
    error,
    cachedAt,
    isLoading,
    loadInitialAnalysis,
    performAnalysis,
    reset,
  }
}
