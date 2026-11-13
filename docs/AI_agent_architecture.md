# Agents

Specialists do the work the orchestrator routes. Each one is a server function. The chat UI does not call them. Contracts are `lib/agents/types.ts`. A child `agent_runs` row is opened and closed by `lib/agents/runChildAgent.ts`. Recording never throws back to the caller.

The dashboard, Plan sidebar, tax modal, and chat share engines. Chat is another client of those engines. The orchestrator that calls these functions is [AI_orchestrator_architecture.md](./AI_orchestrator_architecture.md). Prompt shape, the registry, and the call path are [AI_runtime.md](./AI_runtime.md). Money rules stay in [architecture.md](./architecture.md) and [calculation_logic.md](./calculation_logic.md).

| Agent | Role | Model loop | Owns |
|---|---|---|---|
| Portfolio Analyst | `portfolio_analyst` | `generateText`, tool loop | Figures, scenarios, logging, watchlist |
| News | `news` | None. Shared news pipeline | Holdings or watchlist news package |
| Tax | `tax` | None. `estimateFinnishTax` | Finnish capital-gains estimate |
| Portfolio Analysis | `portfolio_analysis` | `generateObject` inside the insights action | Short risk and concentration bullets |

CSV import is part of the AI layer and is not one of these four. It is below.

## Portfolio Analyst

`runPortfolioAnalystAgent` in `app/actions/ai/portfolio-analyst/agent.ts`.

**What it is for.** Questions about this user's book: totals, holdings, allocation, performance versus a benchmark, targets and drift, a rebalance suggestion, a mix from the investor profile, goal projection, realized P&L, transaction history, a what-if scenario, logging a spot or cash trade, and the watchlist.

**Why it is separate.** Those answers have to come from the ledger reduce and the live marks, not from the model's arithmetic. The tool loop can call code several times. News fetch and tax estimation are refused here so a position answer cannot quietly become a headline or a tax figure.

**How it is built.** `generateText` on xAI. The model id is `MODEL_ID` in that file (currently `grok-4.3`). Temperature 0.2. `maxSteps` 5. The system prompt is `PORTFOLIO_ANALYST_SYSTEM_PROMPT`. A task hint (`answer`, `position_snapshot`, `prepare_trade`) and an optional symbol list are prepended to the user message. If the orchestrator passed news, `buildAnalystNewsContextBlock` appends only that structured handoff.

Tools are assembled in `app/actions/ai/portfolio-analyst/tools.ts`. Descriptions, owners, side effects, and failure modes live in `lib/aiTools/registry.ts`. That file is the contract. This list is the grouping:

| Group | Module | Tools |
|---|---|---|
| Read | `readTools.ts` | `get_portfolio_summary`, `get_holdings`, `get_allocation`, `get_realized_pnl`, `get_transactions` |
| Performance | `performanceTools.ts` | `get_relative_performance` |
| Plan | `planTools.ts` | `get_target_allocation`, `get_rebalance_plan`, `suggest_allocation_mix`, `get_goal_projection` |
| Scenario | `scenarioTools.ts` | `simulate_scenario` |
| Write | `writeTools.ts` | `prepare_transaction`, `confirm_transaction` |
| Watchlist | `watchlistTools.ts` | `list_watchlist`, `add_watchlist_item`, `remove_watchlist_item` |

Read tools load the book through `getPortfolioData` and shape it with `lib/portfolioAnalyst/`. Plan tools call `lib/allocationTargets/` and `lib/projections/`. They are read-only. Applying a mix is the Plan sidebar, not a chat write. Suggestions are not transactions. `get_goal_projection` must not invent the growth rate `r`. Relative performance uses the same snapshot and benchmark helpers as the Performance tab. If snapshots are missing, the tool says so.

**Writes.** Prepare and confirm are specified in the Chat section of [architecture.md](./architecture.md). `assertWriteAllowed` in `lib/aiTools/enforce.ts` is the only confirm gate. Confirm needs a later user message, a live draft, and phrasing that matches the confirm level (`yes` / `confirm`, or `confirm sell` / `confirm trade` when the prepare warned). A failed confirm leaves the draft. Chat prepare stays on stock, ETF, crypto, and cash. The analyst can describe open futures and the cash total from `get_portfolio_summary`. It cannot write a future, a funding row, a fee, or a margin change.

Watchlist add and remove are writes on the commanding turn. Their registry entries set `requiresConfirmation: false`. They must not go through `assertWriteAllowed`.

**Dry-run.** The tool context carries `dryRun`. Prepare describes the draft and does not persist it. Confirm does not insert. Watchlist tools report what they would have done.

The return value to the orchestrator is text plus a tool trace. `transactionSaved` / `transactionError` come from the last `confirm_transaction` in that trace. `watchlistChanged` is set when an add or remove succeeded and was not a dry-run.

## News Agent

`runNewsAgent` in `app/actions/ai/holding-news/agent.ts`.

**What it is for.** Headlines and a short impact read on open holdings, or on the watchlist. The user can ask casually or ask for a fresh fetch.

**Why it is separate.** News is research. It is expensive, rate-limited, and easy for a model to invent. The agent returns bullets the pipeline actually stored. Portfolio size is the analyst's job, and only after this agent has returned a package in the same request.

**How it is built.** There is no tool loop and no chat model inside the agent. `runHoldingNews` in `app/actions/ai/holding-news/service.ts` is the pipeline the dashboard news buttons use:

1. Resolve targets (`newsTargets.ts`). Holdings default to the largest names. `universe=watchlist` reads the watchlist. Caps and the lookback live in `holding-news/constants.ts` (today: 6 names, 7-day window, 14-day extended lookback when a name is still uncovered, 24-hour cooldown).
2. On a fresh run, stock and ETF bullets come from Finnhub company news. Crypto bullets come from the xAI responses API with live search (`xaiLiveSearch.ts`).
3. `analyzeNewsImpact` asks the model for tone, outlook, and points over those bullets.
4. The package is stored in `user_ai_insights`. Holdings use `feature_type = holding_news`. The watchlist uses `watchlist_news`. Each universe has its own cooldown.

`forceRefresh: true` matches the Holdings icon Fetch. It still respects the cooldown. When a forced refresh cannot start a new live fetch, the agent adds a `statusNote` in product language and returns the stored package. A casual ask uses `mode: 'auto'` and does not lecture about the store. Dry-run forces `forceRefresh` off, so the path is storage only.

The agent builds `brief` with `buildNewsBrief`, keeps at most three bullets and three impact points per symbol, and sorts names that have bullets and a negative tone first. The orchestrator is told to prefer `brief`. Cache flags stay on the server output. The tool result the model sees is redacted in the orchestrator and is not a lecture about storage.

The child run's model field is the string `pipeline`, because the cost is the pipeline's own model calls, not a `generateText` loop in this file.

## Tax Agent

`runTaxAgent` in `app/actions/ai/tax/agent.ts`.

**What it is for.** A Finnish capital-gains estimate from this user's transactions: year-to-date disposals, a hypothetical sell, or both. The brief compares FIFO and weighted average against hankintameno-olettama.

**Why it is separate.** Tax is an estimate with its own rules, and it is not the operating P&L on the dashboard. A portfolio model must not invent a euro of tax. The agent calls the estimator and returns `brief` plus a structured `summary`.

**How it is built.** No LLM. The child-run model field is `estimateFinnishTax`. Modes are `ytd`, `hypothetical_sell`, and `full`. For a what-if, a missing quantity can be `sellFraction` of the open holding (0.5 is half), and a missing unit price uses the live mark when the holding has one. The call is `estimateFinnishTax` in `app/actions/tax/estimateTax.ts`, which uses `lib/tax/`. The user-facing text is `buildTaxBrief`. Rates, lots, and what the estimate omits are in [lib/tax/README.md](../lib/tax/README.md). The estimate omits futures. It is not merged into the dashboard book.

## Portfolio Analysis Agent

`runPortfolioAnalysisAgent` in `app/actions/ai/portfolio-insights/agent.ts`.

**What it is for.** A handful of bullets on risks, concentration, and structure. The Summary icon and the chat "analyze my portfolio" route share this pipeline. It is narrative. Exact P&L, tax, and news are the other agents.

**Why it is separate.** The prose is the part a model is for. Regeneration is gated by whether the transactions changed, plus a shared cooldown, so every chat question does not buy a new write-up.

**How it is built.** The agent calls `generatePortfolioInsights` in `app/actions/ai/portfolio-insights/generatePortfolioInsights.ts`:

1. Require a session, a non-empty book, and `XAI_API_KEY`.
2. Load `user_ai_insights` where `feature_type = portfolio_insights`.
3. If `portfolioHash` still matches `computePortfolioHash` of the transactions, return the stored bullets and skip the model.
4. Otherwise apply the global 60-second cooldown on `profiles.last_ai_call_at`. Admins skip it. During the wait, a stored package is returned when one exists.
5. Build a compact text summary of the book and call `generateObject` (schema `aiInsightsSchema`, at most six bullets). The model id is in that action (currently `grok-4.3`).
6. Upsert `{ insights, portfolioHash }` and bump `last_ai_call_at`.

Dry-run does not call the action's write path. The agent reads the stored row and says when nothing is stored yet. `packageUpdated` is true only when a new row was written. `statusNote` carries the calm line (unchanged book, rate limit, dry-run).

## CSV import

`parseCsvWithAI` in `app/actions/ai/csv-import/parseCsvWithAI.ts` is the other model call. It is a Server Action on the import screen, not an orchestrator specialist, and it does not write an `agent_runs` child.

**What it is for.** Turn a broker or exchange CSV the user already capped at 200 data rows into rows that match `csvAiParseSchema`.

**Why a model.** Column layouts differ. The model maps columns. It does not decide the ledger.

**How it is built.** `generateObject` on xAI (`grok-4.3` in that file) over a truncated CSV (50_000 characters). The prompt tells it to keep clock times, uppercase symbols, map a USD-M pair onto the catalog coin, and mark perpetuals, funding, fees, and margin as `future`. It must not invent prices, sizes, or margin. Liquidations, inverse contracts, and options are skips. The client counts rows before the call. The server counts again. The same 60-second `last_ai_call_at` cooldown as insights applies. Admins skip it.

The user reviews the parsed rows. Persistence is `importTransactions` in `app/actions/transactions.ts`, after the normal transaction validation. A parsed row is not a booked row.

## Shared storage

`app/actions/ai/storage.ts` upserts `user_ai_insights` on `(user_id, feature_type)`, so each feature keeps one latest row. Features the AI layer uses:

| `feature_type` | Who writes it |
|---|---|
| `portfolio_analyst_chat` | Chat route, after a non-error finish |
| `portfolio_analyst_pending_tx` | Analyst prepare / confirm |
| `portfolio_analyst_rate` | Chat rate limit |
| `holding_news` | Holdings news pipeline |
| `watchlist_news` | Watchlist news pipeline |
| `portfolio_insights` | Portfolio analysis |

`getLatestAIInsight` checks that the row belongs to the session user.

## Observability and eval

`lib/agentObservability/` records runs, redacts tool payloads, prices tokens in `cost.ts`, and scores eval cases. Admin reads go through `app/actions/agentObservability.ts`. The parent orchestrator row lists invoked specialists. Child rows point at `parent_run_id`.

The live eval suite is `lib/agentEval/runSuite.ts`, started from `app/api/admin/agent-eval/route.ts` for an admin. It calls the Portfolio Analyst prompt and tools directly, not the orchestrator. Ea ch fixture injects a portfolio (`evalMode`). Confirm does not require a stored draft and does not write a real transaction. Dry-run fixtures set `dryRun`. Scores are pure checks in `lib/agentObservability/score.ts` over the tool trace. Fixtures livein `lib/agentEval/fixtures/`.

## Failure shape

Tools that fail return `ok: false`, a stable `failureMode`, and a `recovery` from `lib/aiTools/recovery.ts`: `retry_same`, `fallback_simpler`, `ask_user`, or `abort`. The orchestrator prompt tells the model to follow that field. Examples: a missing confirm phrase is `ask_user`. A news cooldown that still has a stored package is `fallback_simpler`. An estimate that cannot run is `abort` or the tax agent's own error string. The model does not fill the gap with a number.
