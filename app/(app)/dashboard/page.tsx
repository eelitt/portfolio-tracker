import RefreshButton from './components/RefreshButton'
import TransactionModal from './transactions/TransactionModal'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { Suspense } from 'react'
import SummarySkeleton from './components/SummarySkeleton'
import HoldingsSkeleton from './components/HoldingsSkeleton'
import SummarySection from './summary/SummarySection'
import HoldingsSection from './holdings/HoldingsSection'
import TransactionHistorySection from './transactions/TransactionHistorySection'

export default async function DashboardPage() {
  // Only await the absolute minimum here (auth check).
  // All heavier data fetching lives inside the child async components
  // so the static shell (header + navigation) can render immediately.
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login') // extra safety
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Portfolio Tracker</h1>

        {/* One primary (Add) + quiet utility (Refresh); spacing owned here */}
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <TransactionModal />
        </div>
      </div>

      {/* 
        Each major data-dependent region is wrapped in its own Suspense.
        This lets Next.js stream them independently as their data resolves.

        - SummarySection: the 4 KPI cards + partial-price warning banner
        - HoldingsSection: per-symbol cards + allocation pie
        - TransactionHistorySection: table + both CSV export buttons

        The skeletons are real fallbacks now (they were previously placed
        around already-resolved JSX and never showed).
      */}
      <Suspense fallback={<SummarySkeleton />}>
        <SummarySection />
      </Suspense>

      <Suspense fallback={<HoldingsSkeleton />}>
        <HoldingsSection />
      </Suspense>

      <Suspense
        fallback={
          <div className="mt-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Transaction History</h2>
            </div>
            <p className="text-gray-500">Loading transactions...</p>
          </div>
        }
      >
        <TransactionHistorySection />
      </Suspense>
    </div>
  )
}
