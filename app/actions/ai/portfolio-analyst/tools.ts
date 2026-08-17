/**
 * Portfolio Analyst tool factory.
 * Groups live in sibling files; this module only assembles one request set.
 */

import {
  createAnalystToolCtx,
  type PortfolioAnalystToolOptions,
} from './toolContext'
import { createReadTools } from './readTools'
import { createPerformanceTools } from './performanceTools'
import { createPlanTools } from './planTools'
import { createScenarioTools } from './scenarioTools'
import { createWriteTools } from './writeTools'
import { createWatchlistTools } from './watchlistTools'

export type { PortfolioAnalystToolOptions } from './toolContext'

export {
  isExplicitConfirmMessage,
  isElevatedConfirmMessage,
} from '@/lib/aiTools/confirmGate'

export function createPortfolioAnalystTools(
  userId: string,
  options: PortfolioAnalystToolOptions = {}
) {
  const ctx = createAnalystToolCtx(userId, options)
  const read = createReadTools(ctx)
  const performance = createPerformanceTools(ctx)
  const plan = createPlanTools(ctx)
  const scenario = createScenarioTools(ctx)
  const write = createWriteTools(ctx)
  const watchlist = createWatchlistTools(ctx)

  return {
    get_portfolio_summary: read.get_portfolio_summary,
    get_holdings: read.get_holdings,
    get_allocation: read.get_allocation,
    get_relative_performance: performance.get_relative_performance,
    get_target_allocation: plan.get_target_allocation,
    get_rebalance_plan: plan.get_rebalance_plan,
    suggest_allocation_mix: plan.suggest_allocation_mix,
    get_realized_pnl: read.get_realized_pnl,
    get_transactions: read.get_transactions,
    simulate_scenario: scenario.simulate_scenario,
    prepare_transaction: write.prepare_transaction,
    confirm_transaction: write.confirm_transaction,
    list_watchlist: watchlist.list_watchlist,
    add_watchlist_item: watchlist.add_watchlist_item,
    remove_watchlist_item: watchlist.remove_watchlist_item,
  }
}

export type PortfolioAnalystTools = ReturnType<typeof createPortfolioAnalystTools>
