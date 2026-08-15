'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import { getAssetTypeLabel } from '@/lib/utils'
import type { AssetType, EnrichedWatchlistItem, WatchlistAssetType } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { removeWatchlistItem } from '@/app/actions/watchlist'
import { getHoldingLogoCandidates } from '../holdings/holdingLogo'
import { HoldingNewsTooltip } from '../holdings/HoldingNewsTooltip'
import AddWatchlistForm from './AddWatchlistForm'

type WatchlistNews = {
  news: Record<string, string[]>
  impact?: Record<string, HoldingNewsImpactEntry>
  cachedAt?: string
} | null

type Props = {
  items: EnrichedWatchlistItem[]
  preferredCurrency: PreferredCurrency
  usdToPreferredRate: number
  heldSymbols?: Array<{ symbol: string; asset_type: WatchlistAssetType }>
  watchNews?: WatchlistNews
}

/** Inline mark — svg candidates only; hide if none load. */
function WatchlistItemLogo({
  symbol,
  assetType,
}: {
  symbol: string
  assetType: AssetType
}) {
  const svgs = getHoldingLogoCandidates(symbol, assetType).filter((p) =>
    p.endsWith('.svg')
  )
  const [index, setIndex] = useState(0)
  if (svgs.length === 0 || index >= svgs.length) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element -- public svg; try next path on 404
    <img
      src={svgs[index]}
      alt=""
      draggable={false}
      onError={() => setIndex((i) => i + 1)}
      className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
    />
  )
}

function formatChange(change24h: number | null): string {
  if (change24h === null || !Number.isFinite(change24h)) return '—'
  const sign = change24h > 0 ? '+' : ''
  return `${sign}${change24h.toFixed(2)}%`
}

function newsForSymbol(
  news: WatchlistNews,
  symbol: string
): { bullets: string[]; impact?: HoldingNewsImpactEntry } | null {
  if (!news?.news) return null
  const upper = symbol.toUpperCase()
  const bullets =
    news.news[symbol] ??
    news.news[upper] ??
    Object.entries(news.news).find(([k]) => k.toUpperCase() === upper)?.[1]
  if (!bullets?.length) return null
  const impact =
    news.impact?.[symbol] ??
    news.impact?.[upper] ??
    (news.impact
      ? Object.entries(news.impact).find(([k]) => k.toUpperCase() === upper)?.[1]
      : undefined)
  return { bullets, impact }
}

function WatchlistRow({
  item,
  preferredCurrency,
  usdToPreferredRate,
  news,
  newsCachedAt,
  isPending,
  onAdd,
  onRemove,
}: {
  item: EnrichedWatchlistItem
  preferredCurrency: PreferredCurrency
  usdToPreferredRate: number
  news: { bullets: string[]; impact?: HoldingNewsImpactEntry } | null
  newsCachedAt?: string
  isPending: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const changeClass =
    item.change24h == null
      ? 'text-muted-foreground'
      : item.change24h >= 0
        ? 'text-pnl-positive'
        : 'text-pnl-negative'

  const showNewsAt = (e: React.MouseEvent) => {
    if (!news) return
    setCursor({ x: e.clientX, y: e.clientY })
    setTooltipOpen(true)
  }

  return (
    <div className="group relative">
      <div className="relative overflow-hidden rounded-xl border border-subtle bg-surface-elevated transition-all duration-200 group-hover:border-gold group-hover:shadow-md group-hover:shadow-black/15">
        <div className="relative z-10 flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
          <div
            className="flex min-w-0 flex-1 items-center gap-3"
            onMouseEnter={showNewsAt}
            onMouseMove={showNewsAt}
            onMouseLeave={() => setTooltipOpen(false)}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="min-w-0">
              <div className="font-medium">{item.symbol}</div>
              <div className="truncate text-xs text-muted-foreground">
                {item.name}
                <span className="text-muted-foreground/70">
                  {' · '}
                  {getAssetTypeLabel(item.asset_type)}
                </span>
              </div>
            </div>
            <WatchlistItemLogo
              symbol={item.symbol}
              assetType={item.asset_type}
            />
          </div>
          <div className="text-right font-mono text-sm tabular-nums">
            <div>
              {item.priceAvailable && item.currentPrice != null
                ? formatCurrency(
                    item.currentPrice,
                    preferredCurrency,
                    usdToPreferredRate
                  )
                : '—'}
            </div>
            <div className={`text-xs ${changeClass}`}>
              {formatChange(item.change24h)}
            </div>
          </div>
          </div>
          <div
            className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:ml-2"
            onMouseEnter={() => setTooltipOpen(false)}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-500 transition-all duration-200 hover:scale-110 hover:bg-green-500/15 hover:text-green-400 active:scale-95"
              aria-label={`Add transaction for ${item.symbol}`}
              title="Add transaction"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 transition-all duration-200 hover:scale-110 hover:bg-red-600 hover:text-white active:scale-95 disabled:opacity-50"
              aria-label={`Remove ${item.symbol} from watchlist`}
              title="Remove"
              disabled={isPending}
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {news && (
        <HoldingNewsTooltip
          symbol={item.symbol}
          newsBullets={news.bullets}
          impact={news.impact}
          cachedAt={newsCachedAt}
          open={tooltipOpen}
          followCursor
          cursor={cursor}
        />
      )}
    </div>
  )
}

export default function WatchlistTable({
  items,
  preferredCurrency,
  usdToPreferredRate,
  heldSymbols = [],
  watchNews = null,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const openAddTransaction = (symbol: string, assetType: AssetType) => {
    window.dispatchEvent(
      new CustomEvent('add-transaction', {
        detail: { asset_type: assetType, symbol, action: 'buy' },
      })
    )
  }

  const handleRemove = (item: EnrichedWatchlistItem) => {
    startTransition(async () => {
      const result = await removeWatchlistItem(item.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${item.symbol} removed from watchlist`)
      router.refresh()
    })
  }

  return (
    <>
      <AddWatchlistForm heldSymbols={heldSymbols} />

      {items.length === 0 ? (
        <p className="rounded-xl border border-subtle bg-surface-elevated px-4 py-8 text-center text-sm text-muted-foreground">
          Watch a symbol to track its price.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <WatchlistRow
              key={item.id}
              item={item}
              preferredCurrency={preferredCurrency}
              usdToPreferredRate={usdToPreferredRate}
              news={newsForSymbol(watchNews, item.symbol)}
              newsCachedAt={watchNews?.cachedAt}
              isPending={isPending}
              onAdd={() => openAddTransaction(item.symbol, item.asset_type)}
              onRemove={() => handleRemove(item)}
            />
          ))}
        </div>
      )}
    </>
  )
}
