import { Suspense } from 'react'
import { getUserTransactions } from '@/app/actions/transactions'
import { getPortfolioData } from '@/lib/portfolioData'
import PerpCard, { PerpPresence } from './PerpCard'

function PerpSkeleton() {
  return (
    <section id="perps" className="mb-8 scroll-mt-20">
      <PerpPresence available />
      <h2 className="section-title mb-4">
        <span className="section-title-accent">Perp holdings</span>
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-subtle bg-surface-elevated p-4"
          >
            <div className="skeleton-block mb-4 h-5 w-24" />
            <div className="space-y-2">
              <div className="skeleton-block h-4 w-full" />
              <div className="skeleton-block h-4 w-full" />
              <div className="skeleton-block h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

async function PerpCards() {
  const data = await getPortfolioData()
  const open = [...data.openPerps].sort((a, b) => {
    const bySymbol = a.symbol.localeCompare(b.symbol)
    if (bySymbol !== 0) return bySymbol
    return a.positionSide === b.positionSide ? 0 : a.positionSide === 'long' ? -1 : 1
  })

  return (
    <section id="perps" className="mb-8 scroll-mt-20">
      <PerpPresence available />
      <h2 className="section-title mb-4">
        <span className="section-title-accent">Perp holdings</span>
      </h2>
      {data.error ? (
        <div className="alert-error">{data.error}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {open.map((perp) => (
            <PerpCard
              key={`${perp.symbol}-${perp.positionSide}`}
              perp={perp}
              preferredCurrency={data.preferredCurrency}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Nothing until this user's rows are known. No skeleton, and no bar item,
 * when they have no future rows.
 */
export default async function PerpHoldingsSection() {
  const transactions = await getUserTransactions()
  const hasFuture = (transactions || []).some((tx) => tx.asset_type === 'future')
  if (!hasFuture) return <PerpPresence available={false} />

  return (
    <Suspense fallback={<PerpSkeleton />}>
      <PerpCards />
    </Suspense>
  )
}