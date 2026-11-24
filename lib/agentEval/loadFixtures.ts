/**
 * Static registry of eval fixtures. Filter by feature when loading a suite.
 * New cases: add JSON under fixtures/ and import into ALL below.
 */

import type { EvalCaseFixture } from '@/lib/agentObservability'
import summaryBasic001 from './fixtures/summary-basic-001.json'
import holdingsFilter001 from './fixtures/holdings-filter-001.json'
import allocation001 from './fixtures/allocation-001.json'
import realizedPnl001 from './fixtures/realized-pnl-001.json'
import scenarioSell001 from './fixtures/scenario-sell-001.json'
import refuseOutOfScope001 from './fixtures/refuse-out-of-scope-001.json'
import refuseFutureLog001 from './fixtures/refuse-future-log-001.json'
import prepareNoConfirm001 from './fixtures/prepare-no-confirm-001.json'
import confirmBlocked001 from './fixtures/confirm-blocked-001.json'
import softWarnSell001 from './fixtures/soft-warn-sell-001.json'
import dryRunLog001 from './fixtures/dry-run-log-001.json'
import watchlistAdd001 from './fixtures/watchlist-add-001.json'
import watchlistList001 from './fixtures/watchlist-list-001.json'
import futuresWorth001 from './fixtures/futures-worth-001.json'
import routeValue001 from './fixtures/route-value-001.json'
import routeAnalysis001 from './fixtures/route-analysis-001.json'
import routeNews001 from './fixtures/route-news-001.json'
import routeWatchlistNews001 from './fixtures/route-watchlist-news-001.json'
import routeNewsRefresh001 from './fixtures/route-news-refresh-001.json'
import routeTaxHalf001 from './fixtures/route-tax-half-001.json'
import routeLog001 from './fixtures/route-log-001.json'
import routeWatchlist001 from './fixtures/route-watchlist-001.json'
import routeFutureLog001 from './fixtures/route-future-log-001.json'
import routeRefuse001 from './fixtures/route-refuse-001.json'

const ALL: EvalCaseFixture[] = [
  summaryBasic001 as EvalCaseFixture,
  holdingsFilter001 as EvalCaseFixture,
  allocation001 as EvalCaseFixture,
  realizedPnl001 as EvalCaseFixture,
  scenarioSell001 as EvalCaseFixture,
  refuseOutOfScope001 as EvalCaseFixture,
  refuseFutureLog001 as EvalCaseFixture,
  prepareNoConfirm001 as EvalCaseFixture,
  confirmBlocked001 as EvalCaseFixture,
  softWarnSell001 as EvalCaseFixture,
  dryRunLog001 as EvalCaseFixture,
  watchlistAdd001 as EvalCaseFixture,
  watchlistList001 as EvalCaseFixture,
  futuresWorth001 as EvalCaseFixture,
  routeValue001 as EvalCaseFixture,
  routeAnalysis001 as EvalCaseFixture,
  routeNews001 as EvalCaseFixture,
  routeWatchlistNews001 as EvalCaseFixture,
  routeNewsRefresh001 as EvalCaseFixture,
  routeTaxHalf001 as EvalCaseFixture,
  routeLog001 as EvalCaseFixture,
  routeWatchlist001 as EvalCaseFixture,
  routeFutureLog001 as EvalCaseFixture,
  routeRefuse001 as EvalCaseFixture,
]

/** Hard cap so a live suite cannot explode token spend. */
export const MAX_EVAL_CASES = 15

/** Full fixtures for the live runner (filtered + capped). */
export function loadEvalFixtures(feature = 'portfolio_analyst'): EvalCaseFixture[] {
  return ALL.filter((f) => f.feature === feature).slice(0, MAX_EVAL_CASES)
}

/** Every fixture expect, including cases past the live suite cap. */
export function allEvalExpects(): EvalCaseFixture['expect'][] {
  return ALL.map((fixture) => fixture.expect)
}

/** Lightweight list for the admin Eval tab (no seed payloads). */
export function listEvalFixtureMeta(feature = 'portfolio_analyst'): Array<{
  id: string
  description: string
  feature: string
}> {
  return loadEvalFixtures(feature).map((f) => ({
    id: f.id,
    description: f.description,
    feature: f.feature,
  }))
}
