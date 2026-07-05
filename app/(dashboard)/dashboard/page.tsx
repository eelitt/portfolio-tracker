import RefreshButton from './RefreshButton'
import TransactionModal from './TransactionModal'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/app/actions/users'
import { Suspense, type ComponentType } from 'react'
import SummarySkeleton from '../SummarySkeleton'
import HoldingsSkeleton from '../HoldingsSkeleton'
import SummarySection from './SummarySection'
import HoldingsSection from './HoldingsSection'
import TransactionHistorySection from './TransactionHistorySection'

export default async function DashboardPage() {
  // Only await the absolute minimum here (auth check).
  // All heavier data fetching lives inside the child async components
  // so the static shell (header + navigation) can render immediately.
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login') // extra safety
  }

  const hasAiKey = !!process.env.XAI_API_KEY

  let AIInsightsButton: ComponentType<any> | null = null
  if (hasAiKey) {
    const mod = await import('./AIInsightsButton')
    AIInsightsButton = mod.default
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex justify-between items-end mb-8">
        <h1 className="text-3xl font-bold">Portfolio Tracker</h1>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-3">
            <TransactionModal />
            <RefreshButton />
            {AIInsightsButton && <AIInsightsButton />}
          </div>
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
