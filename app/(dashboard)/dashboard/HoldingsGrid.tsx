'use client'

import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { getAssetTypeLabel } from '@/lib/utils'
import type { AssetType } from '@/lib/types'

interface Holding {
  symbol: string
  asset_type: AssetType
  quantity: number
  avgCost: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
}

interface HoldingsGridProps {
  holdings: Holding[]
  transactions: any[]
  preferredCurrency: 'USD' | 'EUR'
  usdToPreferredRate: number
}

export default function HoldingsGrid({
  holdings,
  transactions,
  preferredCurrency,
  usdToPreferredRate,
}: HoldingsGridProps) {
  if (holdings.length === 0) {
    return (
      <div className="col-span-full text-gray-500 py-4">
        No holdings yet. Add your first transaction to get started.
      </div>
    )
  }

  const openEditTransactionModalForHolding = (symbol: string, assetType: AssetType) => {
    // Find transactions for this holding (same symbol and asset_type)
    const relatedTxs = transactions.filter(
      (tx: any) => tx.symbol === symbol && tx.asset_type === assetType
    )
    if (relatedTxs.length === 0) return

    // Pick the most recent one (by executed_at) to open its edit modal
    // This gives the user the edit transaction modal with details from a tx
    // that contributes to this holding.
    const latestTx = [...relatedTxs].sort((a, b) => 
      new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()
    )[0]

    window.dispatchEvent(
      new CustomEvent('edit-transaction', {
        detail: latestTx,
      })
    )
  }

  return (
    <>
      {holdings.map((holding) => (
        <button
          key={holding.symbol}
          onClick={() => openEditTransactionModalForHolding(holding.symbol, holding.asset_type)}
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
                  <div className="font-medium">{holding.quantity}</div>
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
      ))}
    </>
  )
}
