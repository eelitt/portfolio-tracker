import { getPortfolioData } from '@/lib/portfolioData'
import ExportButton from './ExportButton'
import ExportHoldingsButton from './ExportHoldingsButton'
import TransactionTable from './TransactionTable'

/**
 * Async Server Component for the full transaction history section.
 * Includes both export buttons (transactions + current holdings snapshot)
 * because the data needed for the holdings export lives in the same
 * cached payload.
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

  return (
    <div className="mt-10">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Transaction History</h2>
        <div className="flex gap-2">
          <ExportButton transactions={data.transactions} />
          <ExportHoldingsButton holdings={data.enrichedHoldings} />
        </div>
      </div>
      <TransactionTable transactions={data.transactions} />
    </div>
  )
}
