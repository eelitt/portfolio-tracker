import { getAllocationWorkspace } from '@/app/actions/allocation'
import { getUserGoals } from '@/app/actions/goals'
import type { PreferredCurrency } from '@/lib/userTypes'
import PlanSidebar from './PlanSidebar'

/**
 * Server host so Plan shares the dashboard GET's getPortfolioData()
 * (React.cache). Client mount must not call getAllocationWorkspace —
 * that is a new request and re-hits price APIs in dev.
 */
export default async function PlanSidebarHost({
  preferredCurrency,
  canSuggestMix,
}: {
  preferredCurrency: PreferredCurrency
  canSuggestMix: boolean
}) {
  const [goals, workspace] = await Promise.all([
    getUserGoals(),
    getAllocationWorkspace({ mode: 'inplace' }),
  ])

  const initialWorkspace = 'error' in workspace ? undefined : workspace.data
  const initialPortfolioValue = initialWorkspace?.totalMarketValue ?? 0

  return (
    <PlanSidebar
      preferredCurrency={preferredCurrency}
      initialGoals={goals}
      initialPortfolioValue={initialPortfolioValue}
      initialWorkspace={initialWorkspace}
      initialCanSuggestMix={canSuggestMix}
    />
  )
}
