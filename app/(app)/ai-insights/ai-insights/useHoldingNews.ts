'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateHoldingNews } from '@/app/actions/ai/holding-news/generateHoldingNews'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'

export interface HoldingNewsState {
  news: Record<string, string[]> | null
  impact: Record<string, HoldingNewsImpactEntry> | null
  error: string | null
  cachedAt: string | null
  isLoading: boolean
  lastMessage: string | null
  nextRefreshAt: string | null
  windowFrom: string | null
  windowTo: string | null
}

function asImpactMap(raw: unknown): Record<string, HoldingNewsImpactEntry> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, HoldingNewsImpactEntry>
}

export function useHoldingNews() {
  const router = useRouter()
  const [news, setNews] = useState<Record<string, string[]> | null>(null)
  const [impact, setImpact] = useState<Record<string, HoldingNewsImpactEntry> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)
  const [nextRefreshAt, setNextRefreshAt] = useState<string | null>(null)
  const [windowFrom, setWindowFrom] = useState<string | null>(null)
  const [windowTo, setWindowTo] = useState<string | null>(null)

  const reset = () => {
    setNews(null)
    setImpact(null)
    setError(null)
    setCachedAt(null)
    setLastMessage(null)
    setNextRefreshAt(null)
    setWindowFrom(null)
    setWindowTo(null)
  }

  /**
   * Loads previously fetched holding news from the database (no AI cost).
   */
  const loadInitialNews = async () => {
    setIsLoading(true)
    setError(null)
    reset()

    try {
      const latest = await getLatestAIInsightForCurrentUser('holding_news')
      if (latest?.result?.news) {
        const newsMap = latest.result.news as Record<string, string[]>
        setNews(newsMap)
        setImpact(asImpactMap(latest.result.impact))
        setCachedAt(latest.createdAt)
        setWindowFrom(
          typeof latest.result.windowFrom === 'string' ? latest.result.windowFrom : null
        )
        setWindowTo(
          typeof latest.result.windowTo === 'string' ? latest.result.windowTo : null
        )

        const lastFetched = new Date(latest.createdAt).getTime()
        const cooldownMs = 24 * 60 * 60 * 1000
        const hasAnyBullet = Object.values(newsMap).some(
          bullets => Array.isArray(bullets) && bullets.length > 0
        )
        // Match server: only enforce 24h cooldown for live-search results with content
        const isLiveSearchResult = typeof latest.result.windowFrom === 'string'
        if (Date.now() - lastFetched < cooldownMs && isLiveSearchResult && hasAnyBullet) {
          setNextRefreshAt(new Date(lastFetched + cooldownMs).toISOString())
        } else {
          setNextRefreshAt(null)
        }
      }
    } catch {
      // ignore – user can still click Fetch
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Triggers a fresh AI news fetch (subject to 24h holding-news cooldown).
   */
  const fetchFreshNews = async () => {
    setIsLoading(true)
    setError(null)
    setLastMessage(null)

    try {
      const result = await generateHoldingNews()

      if ('error' in result && result.error) {
        setError(result.error)
      } else if ('news' in result && result.news) {
        setNews(result.news)
        setImpact(result.impact ?? null)
        setCachedAt(result.cachedAt ?? new Date().toISOString())
        setNextRefreshAt(result.nextRefreshAt ?? null)
        setWindowFrom(result.windowFrom ?? null)
        setWindowTo(result.windowTo ?? null)

        if ('message' in result && typeof result.message === 'string') {
          setLastMessage(result.message)
        } else {
          setLastMessage(null)
        }

        // Refresh RSC dashboard so holding-card tooltips pick up new bullets
        router.refresh()
      }
    } catch {
      setError('Something went wrong while fetching news. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    news,
    impact,
    error,
    cachedAt,
    isLoading,
    lastMessage,
    nextRefreshAt,
    windowFrom,
    windowTo,
    loadInitialNews,
    fetchFreshNews,
    reset,
  }
}
