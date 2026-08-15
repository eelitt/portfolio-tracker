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
import WatchlistSection from './watchlist/WatchlistSection'

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
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          <span className="text-gold">Portfolio</span>{' '}
          <span className="text-foreground">Tracker</span>
        </h1>

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
          <section className="mb-8">
            <div className="skeleton-block mb-4 h-7 w-36" />
            <div className="mb-4 rounded-xl border border-subtle bg-surface-elevated p-4">
              <div className="skeleton-block h-10 w-full" />
            </div>
            <div className="overflow-hidden rounded-xl border border-subtle bg-surface-elevated p-2">
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-block h-12 w-full" />
                ))}
              </div>
            </div>
          </section>
        }
      >
        <WatchlistSection />
      </Suspense>

      <Suspense
        fallback={
          <section className="mb-8">
            <div className="skeleton-block mb-4 h-7 w-48" />
            <div className="mb-4 rounded-xl border border-subtle bg-surface-elevated p-4">
              <div className="skeleton-block h-10 w-full" />
            </div>
            <div className="overflow-hidden rounded-xl border border-subtle bg-surface-elevated p-2">
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton-block h-10 w-full" />
                ))}
              </div>
            </div>
          </section>
        }
      >
        <TransactionHistorySection />
      </Suspense>
    </div>
  )
}
