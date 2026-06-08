import { createClient } from '@/lib/supabase/server'
import { calculateHoldings } from '@/lib/calculatePortfolio'
import AddTransactionForm from './AddTransactionForm'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch real transactions for the logged-in user
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .order('executed_at', { ascending: true })

  const holdings = calculateHoldings(transactions || [])

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Portfolio Tracker</h1>
      </div>

      {/* Holdings */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Holdings</h2>
        {holdings.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {holdings.map((holding) => (
              <div key={holding.symbol} className="border rounded-lg p-4 bg-white">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-lg">{holding.symbol}</div>
                    <div className="text-sm text-gray-500 capitalize">{holding.asset_type}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-lg">{holding.quantity}</div>
                    <div className="text-xs text-gray-500">Avg ${holding.avgCost}</div>
                  </div>
                </div>
                <div className="mt-4 text-sm">
                  Realized P&amp;L:{' '}
                  <span className={holding.realizedPnl >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                    ${holding.realizedPnl}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No holdings yet. Add your first transaction below.</p>
        )}
      </div>

      {/* Add Transaction Form */}
      <div className="mb-10">
        <AddTransactionForm />
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Transaction History ({transactions?.length || 0})</h2>
        {transactions && transactions.length > 0 ? (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex justify-between border p-3 rounded text-sm">
                <div>
                  <span className="font-medium">{tx.symbol}</span> · {tx.action.toUpperCase()} · {tx.quantity} @ ${tx.unit_price}
                </div>
                <div className="text-gray-500">
                  {new Date(tx.executed_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No transactions yet.</p>
        )}
      </div>
    </div>
  )
}