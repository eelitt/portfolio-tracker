'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateHoldingNews } from '@/app/actions/ai/holding-news/generateHoldingNews'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import { refreshPortfolioPrices } from '@/app/actions/prices'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import {
  HOLDING_NEWS_COOLDOWN_MS,
  HOLDING_NEWS_FEATURE_TYPE,
  newsHasAnyBullets,
  parseHoldingNewsStored,
} from '@/app/actions/ai/holding-news/newsUtils'

export interface HoldingNewsState {
  news: Record<string, string[]> | null
  impact: Record<string, HoldingNewsImpactEntry> | null
  error: string | null
  /** News content age (“news as of”) */
  contentFetchedAt: string | null
  /** Last live check (including no-op) */
  lastCheckedAt: string | null
  /** Alias for content age — used by older UI fields */
  cachedAt: string | null
  isLoading: boolean
  lastMessage: string | null
  nextRefreshAt: string | null
  windowFrom: string | null
  windowTo: string | null
}

export function useHoldingNews() {
  const router = useRouter()
  const [news, setNews] = useState<Record<string, string[]> | null>(null)
  const [impact, setImpact] = useState<Record<string, HoldingNewsImpactEntry> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contentFetchedAt, setContentFetchedAt] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
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
    setContentFetchedAt(null)
    setLastCheckedAt(null)
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
      const latest = await getLatestAIInsightForCurrentUser(HOLDING_NEWS_FEATURE_TYPE)
      if (!latest) return

      const stored = parseHoldingNewsStored(latest.result, latest.createdAt)
      if (!stored) return

      setNews(stored.news)
      setImpact(
        stored.impact && Object.keys(stored.impact).length > 0 ? stored.impact : null
      )
      setContentFetchedAt(stored.contentFetchedAt ?? null)
      setLastCheckedAt(stored.lastCheckedAt ?? null)
      setCachedAt(stored.contentFetchedAt ?? null)
      setWindowFrom(stored.windowFrom ?? null)
      setWindowTo(stored.windowTo ?? null)

      const checkedAt = stored.lastCheckedAt ?? latest.createdAt
      const lastCheckMs = new Date(checkedAt).getTime()
      const hasAnyBullet = newsHasAnyBullets(stored.news)
      const isLiveSearchResult = typeof stored.windowFrom === 'string'
      if (
        !Number.isNaN(lastCheckMs) &&
        Date.now() - lastCheckMs < HOLDING_NEWS_COOLDOWN_MS &&
        isLiveSearchResult &&
        hasAnyBullet
      ) {
        setNextRefreshAt(new Date(lastCheckMs + HOLDING_NEWS_COOLDOWN_MS).toISOString())
      } else {
        setNextRefreshAt(null)
      }
    } catch {
      // ignore – user can still click Fetch
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Triggers a fresh AI news fetch (subject to 24h holding-news cooldown).
   * On error, keeps any already-shown news on screen.
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
        const contentAt = result.contentFetchedAt ?? result.cachedAt ?? new Date().toISOString()
        const checkedAt = result.lastCheckedAt ?? new Date().toISOString()
        setContentFetchedAt(contentAt)
        setLastCheckedAt(checkedAt)
        setCachedAt(contentAt)
        setNextRefreshAt(result.nextRefreshAt ?? null)
        setWindowFrom(result.windowFrom ?? null)
        setWindowTo(result.windowTo ?? null)

        if ('message' in result && typeof result.message === 'string') {
          setLastMessage(result.message)
        } else {
          setLastMessage(null)
        }

        // Bust price cache so dashboard KPIs re-fetch instead of reusing a partial 60s cache
        await refreshPortfolioPrices()
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
    contentFetchedAt,
    lastCheckedAt,
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
