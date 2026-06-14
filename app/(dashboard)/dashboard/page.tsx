import { createClient } from '@/lib/supabase/server'
import { calculateHoldings } from '@/lib/calculatePortfolio'
import { getPricesForHoldings } from '@/lib/priceService'
import AddTransactionForm from './AddTransactionForm'
import RefreshButton from './RefreshButton'
import TransactionTable from './TransactionTable'
import ExportButton from './ExportButton'
import ExportHoldingsButton from './ExportHoldingsButton'
import AllocationPie from './AllocationPie'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .order('executed_at', { ascending: true })

  const holdings = calculateHoldings(transactions || [])

  // Fetch current prices
 const priceData = await getPricesForHoldings(holdings)
 console.log('Price data for holdings:', priceData) // Debug log

  // Calculate enriched holdings with live data + 24h change
  const enrichedHoldings = holdings.map((holding) => {
    const raw = priceData[holding.symbol]
    const data = raw && typeof raw === 'object' 
      ? raw 
      : { price: 0, change24h: null as number | null }

    const currentPrice = data.price
    const marketValue = holding.quantity * currentPrice
    const unrealizedPnl = marketValue - holding.totalCost
    const unrealizedPnlPercent =
      holding.totalCost > 0 ? (unrealizedPnl / holding.totalCost) * 100 : 0

    const change24h = data.change24h ?? 0
    const position24hChange = marketValue * (change24h / 100)

    return {
      ...holding,
      currentPrice,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent,
      change24h,
      position24hChange,
    }
  })

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
        <RefreshButton />
      </div>

     {/* Portfolio Summary */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Total Market Value</div>
          <div className="text-2xl font-semibold">
            ${totalMarketValue.toFixed(2)}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Total Cost Basis</div>
          <div className="text-2xl font-semibold">
            ${totalCost.toFixed(2)}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500">Unrealized P&amp;L</div>
          <div className={`text-2xl font-semibold ${totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${totalUnrealizedPnl.toFixed(2)}
          </div>
        </div>

        {/* NEW 24h Change Card */}
      {/* 24h Change Card */}
        <div className="bg-white border rounded-lg p-4">
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
        </div>
      </div>

      {/* Holdings */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Holdings</h2>
        {enrichedHoldings.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {enrichedHoldings.map((holding) => (
              <div key={holding.symbol} className="border rounded-lg p-4 bg-white">
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
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No holdings yet. Add your first transaction below.</p>
        )}
      </div>
{/* Allocation Pie Chart */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Allocation</h2>
        <AllocationPie enrichedHoldings={enrichedHoldings} />
      </div>
      {/* Add Transaction */}
      <AddTransactionForm />

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