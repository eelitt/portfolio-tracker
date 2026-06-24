import { getPortfolioData } from '@/lib/portfolioData'
import { Card, CardContent } from '@/components/ui/card'
import AllocationPie from './AllocationPie'

/**
 * Async Server Component that renders the current holdings grid
 * and the allocation pie chart.
 *
 * It shares the exact same cached data promise as SummarySection and
 * TransactionHistorySection thanks to React.cache in getPortfolioData.
 */
export default async function HoldingsSection() {
  const data = await getPortfolioData()

  if (data.error) {
    return (
      <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {data.error}
      </div>
    )
  }

  return (
    <>
      {/* Individual holding cards (one per symbol with live price + P&L) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.enrichedHoldings.map((holding) => (
          <Card key={holding.symbol}>
            <CardContent className="p-4">
              <div className="flex justify-between">
                <div>
                  <div className="font-semibold text-lg">{holding.symbol}</div>
                  <div className="text-sm text-gray-500 capitalize">
                    {holding.asset_type}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{holding.quantity}</div>
                  <div className="text-xs text-muted-foreground">
                    @ ${holding.avgCost.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Current Price</span>
                  <span>${holding.currentPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Market Value</span>
                  <span>${holding.marketValue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Unrealized P&amp;L</span>
                  <span
                    className={
                      holding.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    ${holding.unrealizedPnl.toFixed(2)} (
                    {holding.unrealizedPnlPercent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {/* Empty state only appears after data has loaded (not during skeleton) */}
        {data.enrichedHoldings.length === 0 && (
          <div className="col-span-full text-gray-500 py-4">
            No holdings yet. Add your first transaction to get started.
          </div>
        )}
      </div>

      {/* Allocation Pie Chart (by current market value) */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Allocation</h2>
        <AllocationPie enrichedHoldings={data.enrichedHoldings} />
      </div>
    </>
  )
}
