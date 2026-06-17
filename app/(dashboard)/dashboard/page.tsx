
import { calculateHoldings, enrichHoldings } from '@/lib/calculatePortfolio'
import { getPricesForHoldings } from '@/lib/priceService'
import { Card, CardContent } from '@/components/ui/card'
import RefreshButton from './RefreshButton'
import TransactionTable from './TransactionTable'
import ExportButton from './ExportButton'
import ExportHoldingsButton from './ExportHoldingsButton'
import AllocationPie from './AllocationPie'
import TransactionModal from './TransactionModal'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/app/actions/users'
import { getUserTransactions } from '@/app/actions/transactions'

export default async function DashboardPage() {

const user = await getCurrentUser()

  if (!user) {
    redirect('/login') // extra safety
  }

  const transactions = await getUserTransactions()

  const holdings = calculateHoldings(transactions || [])

  // Fetch current prices
 const priceData = await getPricesForHoldings(holdings)
 console.log('Price data for holdings:', priceData) // Debug log

  // Calculate enriched holdings with live data + 24h change
  const enrichedHoldings = enrichHoldings(holdings, priceData)
 
  const totalMarketValue = enrichedHoldings.reduce((sum, h) => sum + h.marketValue, 0)
  const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.totalCost, 0)
  const totalUnrealizedPnl = totalMarketValue - totalCost

  //  Portfolio 24h Change ===
  const total24hChange = enrichedHoldings.reduce((sum, h) => sum + h.position24hChange, 0)
  const previousTotalValue = totalMarketValue - total24hChange
  const total24hChangePercent = previousTotalValue > 0 
    ? (total24hChange / previousTotalValue) * 100 
    : 0

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Portfolio Tracker</h1>
        <div className="flex items-center gap-3">
        <TransactionModal />
        <RefreshButton />
        </div>       
      </div>

     {/* Portfolio Summary */}
<div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <Card className="bg-white">
    <CardContent className="p-4">
      <div className="text-sm text-gray-500">Total Market Value</div>
      <div className="text-2xl font-semibold">
        ${totalMarketValue.toFixed(2)}
      </div>
    </CardContent>
  </Card>

  <Card className="bg-white">
    <CardContent className="p-4">
      <div className="text-sm text-gray-500">Total Cost Basis</div>
      <div className="text-2xl font-semibold">
        ${totalCost.toFixed(2)}
      </div>
    </CardContent>
  </Card>

  <Card className="bg-white">
    <CardContent className="p-4">
      <div className="text-sm text-gray-500">Unrealized P&amp;L</div>
      <div className={`text-2xl font-semibold ${totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        ${totalUnrealizedPnl.toFixed(2)}
      </div>
    </CardContent>
  </Card>

  <Card className="bg-white">
    <CardContent className="p-4">
      <div className="text-sm text-gray-500">24h Change</div>
      {totalMarketValue > 0 ? (
        <div className={`text-2xl font-semibold ${total24hChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          ${total24hChange.toFixed(2)}
          <span className="text-base ml-1">({total24hChangePercent.toFixed(2)}%)</span>
        </div>
      ) : (
        <div className="text-2xl font-semibold text-gray-400">
          — <span className="text-base">(No price data)</span>
        </div>
      )}
    </CardContent>
  </Card>
</div>


      {/* Holdings */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
  {enrichedHoldings.map((holding) => (
    <Card className="bg-white" key={holding.symbol}>
      <CardContent className="p-4">
        <div className="flex justify-between">
          <div>
            <div className="font-semibold text-lg">{holding.symbol}</div>
            <div className="text-sm text-gray-500 capitalize">{holding.asset_type}</div>
          </div>
          <div className="text-right">
            <div className="font-medium">{holding.quantity}</div>
            <div className="text-xs text-gray-500">
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
            <span className={holding.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
              ${holding.unrealizedPnl.toFixed(2)} ({holding.unrealizedPnlPercent.toFixed(1)}%)
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  ))}
</div>
{/* Allocation Pie Chart */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Allocation</h2>
        <AllocationPie enrichedHoldings={enrichedHoldings} />
      </div>

    {/* Transaction History */}
<div className="mt-10">
  <div className="flex justify-between items-center mb-4">
    <h2 className="text-xl font-semibold">Transaction History</h2>
    <div className="flex gap-2">
    <ExportButton transactions={transactions || []} />
    <ExportHoldingsButton holdings={enrichedHoldings} />
  </div>
  </div>
  <TransactionTable transactions={transactions || []} />
</div>
    </div>
  )
}

