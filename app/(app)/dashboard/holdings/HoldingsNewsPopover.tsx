'use client'

/**
 * Holdings title control: batch holding-news package + fetch/refetch.
 * Respects existing cooldown via generateHoldingNews / stored nextRefreshAt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Orbit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionIconPopover } from '@/components/ui/section-icon-popover'
import { generateHoldingNews } from '@/app/actions/ai/holding-news/generateHoldingNews'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import {
  HOLDING_NEWS_COOLDOWN_MS,
  HOLDING_NEWS_FEATURE_TYPE,
  newsHasAnyBullets,
  parseHoldingNewsStored,
} from '@/app/actions/ai/holding-news/newsUtils'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { NEWS_IMPACT_TONE_STYLES } from '@/app/(app)/ai-insights/ai-insights/NewsImpactBlock'
import { formatRelativeTime } from '@/app/(app)/ai-insights/ai-insights/utils'

type InitialNews = {
  news: Record<string, string[]>
  impact?: Record<string, HoldingNewsImpactEntry>
  cachedAt?: string
} | null

function calmNewsMessage(msg: string | null | undefined): string | null {
  if (!msg) return null
  if (/cached|refresh cooldown/i.test(msg)) {
    return msg
      .replace(/Showing cached news\.?\s*/i, '')
      .replace(/Showing latest saved news\.?\s*/i, '')
      .trim() || null
  }
  return msg
}

export default function HoldingsNewsPopover({
  initialNews = null,
  isAdmin = false,
}: {
  initialNews?: InitialNews
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [news, setNews] = useState<Record<string, string[]> | null>(
    initialNews?.news ?? null
  )
  const [impact, setImpact] = useState<Record<string, HoldingNewsImpactEntry> | null>(
    initialNews?.impact ?? null
  )
  const [asOf, setAsOf] = useState<string | null>(initialNews?.cachedAt ?? null)
  /** Last fetch/check time for the holding-news feature (drives daily cooldown). */
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(
    initialNews?.cachedAt ?? null
  )
  const [nextRefreshAt, setNextRefreshAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  /** Keep “available again” relative times fresh while the panel is open. */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const applyStored = useCallback(
    (result: Record<string, unknown>, createdAt: string) => {
      const stored = parseHoldingNewsStored(result, createdAt)
      if (!stored) return
      setNews(stored.news)
      setImpact(
        stored.impact && Object.keys(stored.impact).length > 0
          ? stored.impact
          : null
      )
      setAsOf(stored.contentFetchedAt ?? createdAt)
      const checkedAt = stored.lastCheckedAt ?? createdAt
      setLastFetchedAt(checkedAt)
      const lastCheckMs = Date.parse(checkedAt)
      const hasAny = newsHasAnyBullets(stored.news)
      if (
        !isAdmin &&
        !Number.isNaN(lastCheckMs) &&
        Date.now() - lastCheckMs < HOLDING_NEWS_COOLDOWN_MS &&
        typeof stored.windowFrom === 'string' &&
        hasAny
      ) {
        setNextRefreshAt(
          new Date(lastCheckMs + HOLDING_NEWS_COOLDOWN_MS).toISOString()
        )
      } else {
        setNextRefreshAt(null)
      }
    },
    [isAdmin]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const latest = await getLatestAIInsightForCurrentUser(
        HOLDING_NEWS_FEATURE_TYPE
      )
      if (latest) applyStored(latest.result, latest.createdAt)
    } catch {
      // empty
    } finally {
      setLoading(false)
    }
  }, [applyStored])

  useEffect(() => {
    if (!initialNews?.news) void load()
    else if (initialNews.cachedAt) {
      // Derive cooldown from initial if possible via full load once
      void load()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount hydrate

  // Chat (or other surfaces) may write a new package — reload client state
  useEffect(() => {
    const onUpdated = () => {
      void load()
    }
    window.addEventListener('holding-news-updated', onUpdated)
    return () => window.removeEventListener('holding-news-updated', onUpdated)
  }, [load])

  // After router.refresh(), server initialNews can change — sync without remount
  useEffect(() => {
    if (!initialNews?.news) return
    setNews(initialNews.news)
    setImpact(
      initialNews.impact && Object.keys(initialNews.impact).length > 0
        ? initialNews.impact
        : null
    )
    if (initialNews.cachedAt) {
      setAsOf(initialNews.cachedAt)
      setLastFetchedAt(initialNews.cachedAt)
    }
  }, [initialNews])

  const hasData = Boolean(news && newsHasAnyBullets(news))

  const refreshBlocked =
    !isAdmin &&
    Boolean(nextRefreshAt) &&
    Date.parse(nextRefreshAt!) > now

  const hoursLeft = useMemo(() => {
    if (!nextRefreshAt) return null
    const ms = Date.parse(nextRefreshAt) - now
    if (ms <= 0) return null
    return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)))
  }, [nextRefreshAt, now])

  const fetchNews = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await generateHoldingNews()
      if (result.news) {
        setNews(result.news)
        setImpact(result.impact ?? null)
        const usedAt =
          ('lastCheckedAt' in result && result.lastCheckedAt) ||
          result.contentFetchedAt ||
          result.cachedAt ||
          new Date().toISOString()
        setAsOf(result.contentFetchedAt ?? result.cachedAt ?? usedAt)
        setLastFetchedAt(usedAt)
        setNextRefreshAt(
          'nextRefreshAt' in result ? result.nextRefreshAt ?? null : null
        )
        setMessage(calmNewsMessage(result.message))
        window.dispatchEvent(new CustomEvent('holding-news-updated'))
        router.refresh()
      } else if (result.error) {
        setError(result.error)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const symbols = news
    ? Object.keys(news).sort((a, b) => {
        const aN = news[a]?.length ? 0 : 1
        const bN = news[b]?.length ? 0 : 1
        return aN - bN || a.localeCompare(b)
      })
    : []

  const actionLabel = loading
    ? 'Working…'
    : hasData
      ? 'Refetch news'
      : 'Fetch news'

  // Non-admins: last fetch + when daily refetch unlocks. Admins: last fetch only.
  const headerMeta = lastFetchedAt ? (
    <span>
      Last fetched {formatRelativeTime(lastFetchedAt)}
      {!isAdmin && refreshBlocked && nextRefreshAt ? (
        <>
          <span className="text-muted-foreground/50"> · </span>
          Available again {formatRelativeTime(nextRefreshAt)}
          {hoursLeft != null ? ` (~${hoursLeft}h)` : ''}
        </>
      ) : !isAdmin && hasData && !refreshBlocked ? (
        <>
          <span className="text-muted-foreground/50"> · </span>
          You can fetch again now
        </>
      ) : null}
    </span>
  ) : !loading ? (
    <span>Not fetched yet{!isAdmin ? ' · once per day' : ''}</span>
  ) : null

  return (
    <SectionIconPopover
      label="AI news for your holdings"
      title="Holding news"
      hasData={hasData}
      icon={<Orbit className="h-4 w-4" />}
      headerMeta={headerMeta}
      headerActions={
        <Button
          type="button"
          size="sm"
          disabled={loading || refreshBlocked}
          onClick={() => void fetchNews()}
          title={
            refreshBlocked && nextRefreshAt
              ? `Available again ${formatRelativeTime(nextRefreshAt)}`
              : undefined
          }
          className="h-8 shrink-0 border border-gold/50 bg-[color-mix(in_srgb,var(--gold)_14%,transparent)] px-3 text-sm font-semibold text-gold shadow-sm transition-all duration-200 hover:scale-[1.04] hover:border-gold hover:bg-[color-mix(in_srgb,var(--gold)_22%,transparent)] hover:text-gold-bright hover:shadow-md active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Working…
            </>
          ) : (
            actionLabel
          )}
        </Button>
      }
    >
      <div className="space-y-3" aria-busy={loading}>
        {loading && !hasData && (
          <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-elevated px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Loading…
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {message && !error && (
          <p className="text-xs text-muted-foreground">{message}</p>
        )}

        {!loading && !hasData && !error && (
          <div className="rounded-lg border border-subtle bg-surface-elevated px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
            No news package yet. Fetch recent items for your largest holdings.
          </div>
        )}

        {hasData && (
          <div className="space-y-2">
            {symbols.map((sym) => {
              const bullets = news![sym] || []
              const imp = impact?.[sym]
              const tone = imp
                ? NEWS_IMPACT_TONE_STYLES[imp.tone] ??
                  NEWS_IMPACT_TONE_STYLES.neutral
                : null
              return (
                <div
                  key={sym}
                  className="rounded-lg border border-subtle bg-surface-elevated px-3.5 py-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold tracking-tight text-foreground">
                      {sym}
                    </div>
                    {tone && (
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone.className}`}
                      >
                        {tone.label}
                      </span>
                    )}
                  </div>
                  {bullets.length === 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      No recent items.
                    </p>
                  ) : (
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 marker:text-gold/70">
                      {bullets.slice(0, 3).map((b, i) => (
                        <li
                          key={i}
                          className="text-sm leading-relaxed text-foreground sm:text-[15px]"
                        >
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  {imp?.outlook && (
                    <p className="mt-2 border-t border-subtle/80 pt-2 text-xs leading-snug text-foreground/90">
                      {imp.outlook}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {asOf && hasData && asOf !== lastFetchedAt && (
          <p className="text-xs text-muted-foreground">
            News content as of {formatRelativeTime(asOf)}
          </p>
        )}
      </div>
    </SectionIconPopover>
  )
}
