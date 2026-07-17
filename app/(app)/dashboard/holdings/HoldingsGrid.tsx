'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatQuantity } from '@/lib/currency'
import { getAssetTypeLabel } from '@/lib/utils'
import type { AssetType, EnrichedHolding } from '@/lib/types'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { HoldingNewsTooltip } from './HoldingNewsTooltip'

interface HoldingsGridProps {
  holdings: EnrichedHolding[]
  preferredCurrency: 'USD' | 'EUR'
  usdToPreferredRate: number
  holdingNews?: {
    news: Record<string, string[]>
    impact?: Record<string, HoldingNewsImpactEntry>
    cachedAt?: string
  } | null
}

function HoldingCard({
  holding,
  preferredCurrency,
  newsBullets,
  impact,
  cachedAt,
}: {
  holding: EnrichedHolding
  preferredCurrency: 'USD' | 'EUR'
  newsBullets: string[] | null
  impact?: HoldingNewsImpactEntry
  cachedAt?: string
}) {
  // Hover on card OR tooltip keeps the panel open (shared wrapper).
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const openAddTransactionForHolding = (symbol: string, assetType: AssetType) => {
    window.dispatchEvent(
      new CustomEvent('add-transaction', {
        detail: { asset_type: assetType, symbol },
      })
    )
  }

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => newsBullets && setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
    >
      <button
        type="button"
        onClick={() => openAddTransactionForHolding(holding.symbol, holding.asset_type)}
        className="h-full w-full rounded-xl text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 active:scale-[0.985] dark:hover:shadow-white/10"
      >
        <Card className="h-full">
          <CardContent className="p-4">
            <div className="flex justify-between">
              <div>
                <div className="text-lg font-semibold">{holding.symbol}</div>
                <div className="text-sm text-gray-500">
                  {getAssetTypeLabel(holding.asset_type)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">
                  {holding.asset_type === 'cash'
                    ? formatCurrency(holding.quantity, preferredCurrency, 1)
                    : formatQuantity(holding.quantity, preferredCurrency)}
                </div>
                <div className="text-xs text-muted-foreground">
                  @ {formatCurrency(holding.avgCost, preferredCurrency, 1)}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Current Price</span>
                <span>{formatCurrency(holding.currentPrice, preferredCurrency, 1)}</span>
              </div>
              <div className="flex justify-between">
                <span>Market Value</span>
                <span>{formatCurrency(holding.marketValue, preferredCurrency, 1)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Unrealized P&amp;L</span>
                <span
                  className={
                    holding.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }
                >
                  {formatCurrency(holding.unrealizedPnl, preferredCurrency, 1)} (
                  {holding.unrealizedPnlPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </button>

      {newsBullets && (
        <HoldingNewsTooltip
          symbol={holding.symbol}
          newsBullets={newsBullets}
          impact={impact}
          cachedAt={cachedAt}
          open={tooltipOpen}
        />
      )}
    </div>
  )
}

export default function HoldingsGrid({
  holdings,
  preferredCurrency,
  holdingNews,
}: HoldingsGridProps) {
  if (holdings.length === 0) {
    return (
      <div className="col-span-full py-4 text-gray-500">
        No holdings yet. Add your first transaction to get started.
      </div>
    )
  }

  const getNewsForHolding = (symbol: string) => {
    if (!holdingNews?.news) return null
    const bullets = holdingNews.news[symbol]
    if (!bullets || bullets.length === 0) return null
    return bullets
  }

  return (
    <>
      {holdings.map((holding) => {
        const newsBullets = getNewsForHolding(holding.symbol)
        const impact = holdingNews?.impact?.[holding.symbol]

        return (
          <HoldingCard
            key={holding.symbol}
            holding={holding}
            preferredCurrency={preferredCurrency}
            newsBullets={newsBullets}
            impact={impact}
            cachedAt={holdingNews?.cachedAt}
          />
        )
      })}
    </>
  )
}
