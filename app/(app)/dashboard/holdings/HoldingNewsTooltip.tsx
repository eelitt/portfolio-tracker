'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { HoldingNewsImpactEntry, NewsImpactTone } from '@/lib/schemas'
import { NewsImpactBlock } from '@/app/(app)/ai-insights/ai-insights/NewsImpactBlock'

const PANEL_WIDTH_PX = 288 // w-72
const VIEWPORT_PAD = 8

const TONE_BADGE: Record<NewsImpactTone, { label: string; className: string }> = {
  positive: {
    label: 'Positive',
    className: 'bg-green-500/15 text-green-700 dark:text-green-400',
  },
  neutral: {
    label: 'Neutral',
    className: 'bg-muted text-muted-foreground',
  },
  negative: {
    label: 'Negative',
    className: 'bg-red-500/15 text-red-700 dark:text-red-400',
  },
  mixed: {
    label: 'Mixed',
    className: 'bg-amber-500/15 text-amber-800 dark:text-amber-400',
  },
}

interface HoldingNewsTooltipProps {
  symbol: string
  newsBullets: string[]
  impact?: HoldingNewsImpactEntry
  cachedAt?: string
  /** Controlled open state (hover on card + panel wrapper). */
  open: boolean
}

/**
 * Hover panel for holding news + impact.
 * Desktop: right of card (flips left if near viewport edge), min-height of card.
 * Mobile: below card. Sections collapsible with chevrons.
 */
export function HoldingNewsTooltip({
  symbol,
  newsBullets,
  impact,
  cachedAt,
  open,
}: HoldingNewsTooltipProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [placeLeft, setPlaceLeft] = useState(false)
  const [newsOpen, setNewsOpen] = useState(true)
  const [impactOpen, setImpactOpen] = useState(true)
  const newsId = useId()
  const impactId = useId()

  const recomputeSide = useCallback(() => {
    const el = panelRef.current
    if (!el?.parentElement) return
    // Prefer right; flip left if not enough room
    const parentRect = el.parentElement.getBoundingClientRect()
    const spaceRight = window.innerWidth - parentRect.right - VIEWPORT_PAD
    setPlaceLeft(spaceRight < PANEL_WIDTH_PX + 8)
  }, [])

  useEffect(() => {
    if (!open) return
    recomputeSide()
    window.addEventListener('resize', recomputeSide)
    return () => window.removeEventListener('resize', recomputeSide)
  }, [open, recomputeSide])

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const tone = impact ? TONE_BADGE[impact.tone] ?? TONE_BADGE.neutral : null

  // md+: side of card; below on small screens
  const positionClass = placeLeft
    ? 'md:left-auto md:right-full md:mr-2 md:top-0 md:ml-0'
    : 'md:left-full md:right-auto md:ml-2 md:top-0'

  return (
    <div
      ref={panelRef}
      role="tooltip"
      className={[
        'absolute z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-sm shadow-lg',
        'transition-opacity duration-150',
        // Mobile / default: below card
        'left-0 top-full mt-2',
        // Desktop side placement
        positionClass,
        'md:mt-0 md:min-h-full',
        open
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0',
      ].join(' ')}
    >
      <div className="flex min-h-full flex-col gap-2">
        {/* News section */}
        <section>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">
              News
              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                ({newsBullets.length})
              </span>
            </span>
            <button
              type="button"
              aria-expanded={newsOpen}
              aria-controls={newsId}
              onClick={(e) => {
                stop(e)
                setNewsOpen((v) => !v)
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={newsOpen ? 'Collapse news' : 'Expand news'}
            >
              {newsOpen ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          {newsOpen && (
            <ul id={newsId} className="mt-1.5 space-y-1 text-muted-foreground">
              {newsBullets.map((bullet, idx) => (
                <li key={idx} className="flex gap-1.5">
                  <span className="shrink-0">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Impact section */}
        {impact && (
          <section className="border-t pt-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Impact
                </span>
                {tone && (
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone.className}`}
                  >
                    {tone.label}
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-expanded={impactOpen}
                aria-controls={impactId}
                onClick={(e) => {
                  stop(e)
                  setImpactOpen((v) => !v)
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={impactOpen ? 'Collapse impact' : 'Expand impact'}
              >
                {impactOpen ? (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            {impactOpen && (
              <div id={impactId} className="mt-1.5">
                <NewsImpactBlock impact={impact} compact hideHeader />
              </div>
            )}
          </section>
        )}

        {cachedAt && (
          <div className="mt-auto pt-1 text-[10px] text-muted-foreground/70">
            Updated recently · {symbol}
          </div>
        )}
      </div>
    </div>
  )
}
