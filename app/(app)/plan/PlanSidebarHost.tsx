import { getAllocationWorkspace } from '@/app/actions/allocation'
import { getAssumptionRates } from '@/app/actions/assumptions'
import { getUserGoals } from '@/app/actions/goals'
import type { Horizon, MonthlyContribution } from '@/lib/allocationTargets'
import {
  CRYPTO_RATE_FALLBACK,
  evaluateGoalFromDate,
  expectedReturnFromSlices,
  usedCryptoRates,
  type AssumptionPack,
} from '@/lib/projections'
import type { PreferredCurrency } from '@/lib/userTypes'
import PlanSidebar from './PlanSidebar'

function fallbackPack(): AssumptionPack {
  return {
    fallbackCrypto: CRYPTO_RATE_FALLBACK,
    btc: {
      cryptoRate: CRYPTO_RATE_FALLBACK,
      rawCagr: null,
      windowStart: null,
      windowEnd: null,
      source: 'fallback',
      computedAt: null,
    },
    coins: [],
  }
}

/**
 * Server host so Plan shares the dashboard GET's getPortfolioData()
 * (React.cache). Client mount must not call getAllocationWorkspace —
 * that is a new request and re-hits price APIs in dev.
 */
export default async function PlanSidebarHost({
  preferredCurrency,
  canSuggestMix,
  contributionBand,
  horizon,
}: {
  preferredCurrency: PreferredCurrency
  canSuggestMix: boolean
  contributionBand: MonthlyContribution | null
  horizon: Horizon | null
}) {
  const workspace = await getAllocationWorkspace({ mode: 'inplace' })
  const initialWorkspace = 'error' in workspace ? undefined : workspace.data
  const slices = initialWorkspace?.returnSlices ?? []
  const cryptoSymbols = slices
    .filter((s) => s.assetType === 'crypto')
    .map((s) => s.symbol)

  const [goals, assumptions] = await Promise.all([
    getUserGoals(),
    getAssumptionRates({ refresh: false, symbols: cryptoSymbols }),
  ])

  const initialPortfolioValue = initialWorkspace?.totalMarketValue ?? 0
  const pack = assumptions ?? fallbackPack()

  const primary = goals.find((g) => !g.is_completed)
  let cashPrefill: number | undefined
  if (primary) {
    if (primary.planned_monthly != null) {
      cashPrefill = Number(primary.planned_monthly)
    } else if (primary.target_date) {
      const annualRate = expectedReturnFromSlices(
        slices,
        usedCryptoRates(pack),
        pack.fallbackCrypto
      )
      const ev = evaluateGoalFromDate({
        pv: initialPortfolioValue,
        target: primary.target_amount,
        annualRate,
        targetDate: primary.target_date,
        plannedMonthly: null,
      })
      if (ev.requiredMonthly != null) cashPrefill = ev.requiredMonthly
    }
  }

  return (
    <PlanSidebar
      preferredCurrency={preferredCurrency}
      initialGoals={goals}
      initialPortfolioValue={initialPortfolioValue}
      initialWorkspace={initialWorkspace}
      initialCanSuggestMix={canSuggestMix}
      initialAssumptions={pack}
      contributionBand={contributionBand}
      horizon={horizon}
      initialCashPrefill={cashPrefill}
    />
  )
}
