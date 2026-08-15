import { getPortfolioData } from '@/lib/portfolioData'
import TransactionTable from './TransactionTable'

/**
 * Open section (like Summary/Holdings): title only; table/filters own their surfaces.
 */
export default async function TransactionHistorySection() {
  const data = await getPortfolioData()

  if (data.error) {
    return (
      <div id="transactions" className="alert-error mb-6 scroll-mt-20">
        {data.error}
      </div>
    )
  }

  const transactionsWithFormattedDate = data.transactions.map((tx) => ({
    ...tx,
    formattedDate: new Date(tx.executed_at).toLocaleDateString('fi-FI', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
  }))

  return (
    <section id="transactions" className="mb-8 scroll-mt-20">
      <h2 className="section-title mb-4">
        <span className="section-title-accent">Transaction History</span>
      </h2>
      <TransactionTable
        transactions={transactionsWithFormattedDate}
        preferredCurrency={data.preferredCurrency}
        usdToPreferredRate={data.usdToPreferredRate}
        usdToEurRate={data.usdToEurRate}
      />
    </section>
  )
}
