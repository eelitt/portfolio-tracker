import { getPortfolioData } from '@/lib/portfolioData'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Async Server Component for the top portfolio summary.
 * Lives inside its own <Suspense> boundary in the page so it can stream
 * in independently while prices are being fetched.
 */
export default async function SummarySection() {
  const data = await getPortfolioData()

  if (data.error) {
    return (
      <div className="mb-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {data.error}
      </div>
    )
  }

  // Show the amber warning only when we have holdings but didn't get
  // prices for every symbol (partial data is still usable).
  const showPartialPriceWarning =
    data.holdingsCount > 0 &&
    Object.keys(data.priceData).length < data.holdingsCount

  return (
    <>
      {showPartialPriceWarning && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Live prices loaded for{' '}
          <span className="font-medium">{Object.keys(data.priceData).length}</span> of{' '}
          <span className="font-medium">{data.holdingsCount}</span> holdings.
          Some data may be outdated.
        </div>
      )}

      {/* Four KPI summary cards (market value, cost basis, unrealized P&L, 24h change) */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Market Value</div>
            <div className="text-2xl font-semibold">
              ${data.totalMarketValue.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total Cost Basis</div>
            <div className="text-2xl font-semibold">
              ${data.totalCost.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Unrealized P&amp;L</div>
            <div
              className={`text-2xl font-semibold ${
                data.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              ${data.totalUnrealizedPnl.toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">24h Change</div>
            {data.totalMarketValue > 0 ? (
              <div
                className={`text-2xl font-semibold ${
                  data.total24hChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                ${data.total24hChange.toFixed(2)}
                <span className="text-base ml-1">
                  ({data.total24hChangePercent.toFixed(2)}%)
                </span>
              </div>
            ) : (
              <div className="text-2xl font-semibold text-gray-400">
                — <span className="text-base">(No price data)</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
