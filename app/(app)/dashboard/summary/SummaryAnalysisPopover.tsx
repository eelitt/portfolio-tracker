'use client'

/**
 * Summary title control: portfolio analysis bullets + Analyze / Re-analyze.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Orbit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionIconPopover } from '@/components/ui/section-icon-popover'
import { generatePortfolioInsights } from '@/app/actions/ai/portfolio-insights/generatePortfolioInsights'
import { getLatestAIInsightForCurrentUser } from '@/app/actions/ai/storage'
import { formatRelativeTime } from '@/app/(app)/ai-insights/ai-insights/utils'

function calmAnalysisMessage(msg: string | null | undefined): string | null {
  if (!msg) return null
  const m = msg.toLowerCase()
  if (m.includes('unchanged') || m.includes('previous analysis')) {
    return 'Portfolio unchanged — showing latest analysis.'
  }
  if (m.includes('rate limited') || m.includes('wait')) {
    return msg.replace(/cached result\s*/i, '').trim() || msg
  }
  return msg
}

export default function SummaryAnalysisPopover() {
  const [insights, setInsights] = useState<string[] | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const latest = await getLatestAIInsightForCurrentUser('portfolio_insights')
      if (latest) {
        const arr = Array.isArray(latest.result.insights)
          ? latest.result.insights.map(String)
          : latest.result.insights
            ? [String(latest.result.insights)]
            : []
        setInsights(arr.length ? arr : null)
        setCachedAt(latest.createdAt)
      } else {
        setInsights(null)
        setCachedAt(null)
      }
    } catch {
      // empty state
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [])

  // Prefetch lightly so icon can show hasData after first paint interaction path
  useEffect(() => {
    void load()
  }, [load])

  const analyze = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await generatePortfolioInsights()
      if (result.error) {
        setError(result.error)
      } else if (result.insights) {
        setInsights(
          Array.isArray(result.insights)
            ? result.insights.map(String)
            : [String(result.insights)]
        )
        setCachedAt(result.cachedAt ?? new Date().toISOString())
        setMessage(calmAnalysisMessage(result.message) ?? null)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }

  const hasData = Boolean(insights && insights.length > 0)

  const actionLabel = loading
    ? 'Working…'
    : hasData
      ? 'Re-analyze'
      : 'Analyze'

  return (
    <SectionIconPopover
      label="AI portfolio analysis"
      title="Portfolio analysis"
      hasData={hasData}
      icon={<Orbit className="h-4 w-4" />}
      headerActions={
        <Button
          type="button"
          size="sm"
          disabled={loading}
          onClick={() => void analyze()}
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

        {hasData && (
          <div className="rounded-lg border border-subtle bg-surface-elevated px-3.5 py-3 shadow-sm">
            <ul className="list-disc space-y-2.5 pl-4 marker:text-gold/70">
              {insights!.map((line, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed text-foreground sm:text-[15px]"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loadedOnce && !loading && !hasData && !error && (
          <div className="rounded-lg border border-subtle bg-surface-elevated px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
            No analysis yet. Run a quick read of concentration, risk, and
            structure.
          </div>
        )}

        {cachedAt && hasData && (
          <p className="text-xs text-muted-foreground">
            Last analyzed {formatRelativeTime(cachedAt)}
          </p>
        )}
      </div>
    </SectionIconPopover>
  )
}
