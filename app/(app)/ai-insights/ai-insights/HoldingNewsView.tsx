'use client'

import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { NewsImpactBlock } from './NewsImpactBlock'

interface HoldingNewsViewProps {
  news: Record<string, string[]> | null
  impact?: Record<string, HoldingNewsImpactEntry> | null
  error: string | null
  cachedAt: string | null
  isLoading: boolean
  lastMessage?: string | null
  nextRefreshAt?: string | null
  windowFrom?: string | null
  windowTo?: string | null
  onBack: () => void
  onFetch: () => void
  formatRelativeTime: (isoString: string) => string
}

export function HoldingNewsView({
  news,
  impact = null,
  error,
  cachedAt,
  isLoading,
  lastMessage,
  nextRefreshAt = null,
  windowFrom = null,
  windowTo = null,
  onBack,
  onFetch,
  formatRelativeTime,
}: HoldingNewsViewProps) {
  const hasNews = news && Object.keys(news).length > 0
  // nextRefreshAt is only set while the 24h cooldown is still active
  const refreshBlocked = Boolean(nextRefreshAt)

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-8 px-3 flex items-center gap-1 transition-all hover:shadow-sm active:translate-y-px"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-sm font-medium">Holding News</span>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={onFetch}
          disabled={isLoading || refreshBlocked}
          className="flex items-center gap-2"
          title={
            refreshBlocked && nextRefreshAt
              ? `Next refresh ${formatRelativeTime(nextRefreshAt)}`
              : undefined
          }
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {cachedAt || hasNews ? 'Refresh News' : 'Fetch Fresh News'}
        </Button>
      </div>

      {isLoading && !news && (
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading previous news...
          </div>
        </div>
      )}

      {error && (
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded">
            {error}
          </div>
        </div>
      )}

      {lastMessage && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded text-sm">
          <span>{lastMessage}</span>
        </div>
      )}

      {refreshBlocked && nextRefreshAt && !lastMessage && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 p-3 rounded text-sm">
          <span>
            News can be refreshed once per day. Next refresh{' '}
            {formatRelativeTime(nextRefreshAt)}.
          </span>
        </div>
      )}

      {isLoading && news && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching live news with AI (web + X)...
        </div>
      )}

      {hasNews && (
        <div className="space-y-4">
          {cachedAt && !lastMessage && (
            <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 p-2 rounded space-y-0.5">
              <div>Last updated {formatRelativeTime(cachedAt)}</div>
              {windowFrom && windowTo && (
                <div className="text-blue-600/80">
                  Coverage: {windowFrom} → {windowTo}
                </div>
              )}
            </div>
          )}

          {Object.entries(news).map(([symbol, bullets]) => {
            const entryImpact = impact?.[symbol]
            return (
              <div key={symbol} className="bg-card border rounded-lg p-4">
                <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <span>{symbol}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    ({bullets.length} {bullets.length === 1 ? 'item' : 'items'})
                  </span>
                </div>

                {bullets.length > 0 ? (
                  <ul className="space-y-1.5 text-sm">
                    {bullets.map((bullet, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-muted-foreground mt-0.5">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recent news for this holding.
                  </p>
                )}

                {entryImpact && bullets.length > 0 && (
                  <NewsImpactBlock impact={entryImpact} />
                )}
              </div>
            )
          })}

          <p className="text-[11px] text-muted-foreground px-0.5">
            Rough AI read of headlines — not financial advice.
          </p>
        </div>
      )}

      {!hasNews && !isLoading && !error && (
        <div className="bg-card border rounded-lg p-4 text-center py-8">
          <p className="text-sm text-muted-foreground mb-3">
            No news fetched yet for your current holdings.
          </p>
          <Button onClick={onFetch} disabled={isLoading || refreshBlocked}>
            Fetch Fresh News
          </Button>
        </div>
      )}
    </div>
  )
}
