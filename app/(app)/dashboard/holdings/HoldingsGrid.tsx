'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatQuantity } from '@/lib/currency'
import { getAssetTypeLabel } from '@/lib/utils'
import type { AssetType, EnrichedHolding } from '@/lib/types'
import type { HoldingNewsImpactEntry } from '@/lib/schemas'
import { NewsImpactBlock } from '@/app/(app)/ai-insights/ai-insights/NewsImpactBlock'

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

export default function HoldingsGrid({
  holdings,
  preferredCurrency,
  holdingNews,
}: HoldingsGridProps) {
  if (holdings.length === 0) {
    return (
      <div className="col-span-full text-gray-500 py-4">
        No holdings yet. Add your first transaction to get started.
      </div>
    )
  }

  const openAddTransactionForHolding = (symbol: string, assetType: AssetType) => {
    // Clicking a holding is a shortcut to *record a new transaction* for that position.
    // We dispatch to the add flow (prefilled) so the user can easily sell (or buy more).
    // This respects the architecture: holdings are always calculated from transactions.
    // Editing specific past transactions remains available from the Transaction History table.
    window.dispatchEvent(
      new CustomEvent('add-transaction', {
        detail: { asset_type: assetType, symbol },
      })
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
          <div key={holding.symbol} className="group relative">
            <button
              onClick={() => openAddTransactionForHolding(holding.symbol, holding.asset_type)}
              className="text-left w-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-white/10 active:scale-[0.985]"
            >
              <Card className="h-full">
                <CardContent className="p-4">
                  <div className="flex justify-between">
                    <div>
                      <div className="font-semibold text-lg">{holding.symbol}</div>
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

            {/* Lightweight hover tooltip: news + optional impact */}
            {newsBullets && (
              <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border bg-popover p-3 text-sm shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                <div className="font-medium mb-1.5">Recent news for {holding.symbol}</div>
                <ul className="space-y-1 text-muted-foreground">
                  {newsBullets.map((bullet, idx) => (
                    <li key={idx} className="flex gap-1.5">
                      <span>•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                {impact && <NewsImpactBlock impact={impact} compact />}
                {holdingNews?.cachedAt && (
                  <div className="mt-2 text-[10px] text-muted-foreground/70">
                    Updated recently
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
