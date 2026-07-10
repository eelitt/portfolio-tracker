import { getPortfolioData } from '@/lib/portfolioData'
import TransactionTable from './TransactionTable'
import { formatCurrency } from '@/lib/currency'

/**
 * Async Server Component for the full transaction history section.
 * Exports have been moved to the user dropdown (navbar) for a cleaner interface.
 */
export default async function TransactionHistorySection() {
  const data = await getPortfolioData()

  if (data.error) {
    return (
      <div className="mt-10 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {data.error}
      </div>
    )
  }

  // Pre-format dates on the server for stable hydration (avoids locale formatting differences
  // between Node.js and the browser in the client component).
  const transactionsWithFormattedDate = data.transactions.map((tx) => ({
    ...tx,
    formattedDate: new Date(tx.executed_at).toLocaleDateString('fi-FI', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
  }))

  return (
    <div className="mt-10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Transaction History</h2>
        {/* Exports are now available in the user dropdown menu (top right) */}
      </div>
      <TransactionTable 
        transactions={transactionsWithFormattedDate} 
        preferredCurrency={data.preferredCurrency}
        usdToPreferredRate={data.usdToPreferredRate}
        usdToEurRate={data.usdToEurRate}
      />
    </div>
  )
}
