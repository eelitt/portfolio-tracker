import type { HoldingNewsImpactEntry, NewsImpactTone } from '@/lib/schemas'

const TONE_STYLES: Record<
  NewsImpactTone,
  { label: string; className: string }
> = {
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

interface NewsImpactBlockProps {
  impact: HoldingNewsImpactEntry
  /** denser layout for holding card tooltips */
  compact?: boolean
  /** When true, omit Impact label + tone badge (parent owns the header). */
  hideHeader?: boolean
}

export function NewsImpactBlock({
  impact,
  compact = false,
  hideHeader = false,
}: NewsImpactBlockProps) {
  const tone = TONE_STYLES[impact.tone] ?? TONE_STYLES.neutral

  return (
    <div
      className={
        hideHeader
          ? compact
            ? 'space-y-1'
            : 'space-y-1.5'
          : compact
            ? 'mt-2 space-y-1 border-t pt-2'
            : 'mt-3 space-y-1.5 border-t pt-3'
      }
    >
      {!hideHeader && (
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium uppercase tracking-wide ${compact ? '' : 'text-muted-foreground'}`}
          >
            Impact
          </span>
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone.className}`}
          >
            {tone.label}
          </span>
        </div>
      )}
      <p className={compact ? 'text-xs text-foreground/90' : 'text-sm text-foreground/90'}>
        {impact.outlook}
      </p>
      {impact.points.length > 0 && (
        <ul
          className={
            compact
              ? 'space-y-0.5 text-xs text-muted-foreground'
              : 'space-y-1 text-sm text-muted-foreground'
          }
        >
          {impact.points.map((point, idx) => (
            <li key={idx} className="flex gap-1.5">
              <span className="shrink-0">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
