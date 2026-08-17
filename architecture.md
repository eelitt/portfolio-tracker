# Architecture

How a request becomes numbers the user is allowed to trust.

The [README](./README.md) is the pitch. [AGENTS.md](./AGENTS.md) is phases, layout, and coding rules. This file is the **control plane**: what is source of truth, which functions are allowed to invent money, and what happens on the paths that matter.

---

## Thesis

1. **`transactions` are the only ledger.** There is no holdings table. Open positions, cost basis, and realized P&L are reduced in process.
2. **Money math is pure and shared.** Dashboard, Plan sidebar, tax estimate, and analyst tools call the same helpers. The model does not compute balances.
3. **Isolation is layered.** Session cookies, `profiles.access_to_app`, and Postgres RLS all have to agree. The AI stack is not a second data plane — it uses the user-scoped Supabase client.

If those three fail, the UI being pretty does not matter.

---

## Isolation

A signed-in user is not enough. Signup creates a `profiles` row with `access_to_app = false` until an admin grants it.

| Layer | What it does |
|---|---|
| Middleware (`lib/supabase/middleware.ts`) | Refreshes the auth cookie. Unauthenticated app routes → `/login`. Authenticated but `access_to_app !== true` → sign out, `/login?reason=access`. Fail **closed** if the profile read fails. |
| Login `ensureAppAccess` | Same flag after password/session; signs out on deny. |
| `(app)/layout.tsx` | Loads profile; no access → sign out + redirect. |
| `POST /api/portfolio-analyst` | 401 if no user, 403 if no access. |
| RLS | User tables (`transactions`, `watchlist`, `goals`, `allocation_*`, `portfolio_snapshots`, `user_ai_insights`, …) use `user_id = auth.uid()`. Admin list/update uses the service-role client **after** `requireAdmin`. |

The browser never sees Finnhub or service-role keys. Price and AI calls are Server Actions / Route Handlers.

---

## Dashboard load — the money pipeline

Every dashboard section that needs a book calls `getPortfolioData()` (`lib/portfolioData.ts`). It is wrapped in `React.cache`, so layout, summary, holdings, and a same-request Plan/workspace read share one run.

```
profile (preferred currency)
        + Frankfurter USD→EUR (fallback 0.92)
        + getUserTransactions()          -- RLS
        │
        ├─ calculateHoldings(txs)        -- weighted average, per symbol
        │       drop cash rows from this book
        │       getPricesForHoldings(assets, { forceFresh: false })
        │       enrichHoldings            -- missing/0 quote ⇒ priceAvailable false, uPnL 0
        │       toPreferredHolding        -- marks are USD; costs in entry currency; recompute P&L
        │
        └─ calculateCashHoldingsInPreferred(txs)
                convert each cash tx, then net
        │
        └─ aggregatePreferredPortfolio(assets, cash)
                MV / 24h = priced assets + cash
                cost = all open positions (including unpriced)
                uPnL = priced assets only
```

### Why cash is a second reduce

`calculateHoldings` groups by symbol and stamps **currency from the first chronological row**. Mixed EUR+USD cash would become a nonsense face sum. Cash is therefore converted **per transaction** into preferred currency and netted there. Asset positions still use the first-tx currency as the cost denomination (one currency per symbol is the current model, not a multi-lot FX book).

### Invariants this pipeline exists to protect

- **Weighted average cost.** A sell uses average cost at that moment, not FIFO. Oversells are capped to quantity owned; remaining `avgCost` does not change.
- **A missing or zero live quote is not a total loss.** `enrichHoldings` zeros market fields and sets `priceAvailable: false`. Aggregates must not treat that as mark-to-market $0.
- **Do not FX-scale mixed P&L.** Live quotes are USD. Cost / realized P&L are in the holding’s entry currency. `toPreferredHolding` converts each side, then recomputes unrealized P&L. `500 * rate` of a mixed-unit P&L is a bug.
- **24h %** uses previous total = MV − 24h $, and is 0 when that base is not positive.

`getCurrentUserProfile` is also `React.cache`’d so layout and the pipeline do not double-query `profiles`.

---

## Two books: dashboard vs tax

| Book | Method | Where |
|---|---|---|
| Operating P&L | Weighted average, all history, preferred currency after FX | `calculateHoldings` + enrich + convert |
| Finnish CG estimate | FIFO **and** weighted average, EUR, HMO compare, calendar year | `lib/tax/` via `appTransactionsToTaxableEvents` |

They must not share a lot engine. Dashboard “realized P&L” is not taxable gain. Tax skips cash / inflow / outflow, converts unit prices to EUR, and can apply hankintameno-olettama (never on a loss). Small-disposal (€1,000 proceeds), progressive 30/34%, and hypothetical sells are estimator rules, not portfolio state.

UI: navbar tax modal. Chat: Tax Agent, same functions. Estimate only.

---

## Prices

Called only for **open non-cash holdings** (and watchlist / fund NAVs when those UIs need them). Never for the full `lib/symbols/*.json` catalogs.

| Kind | Source |
|---|---|
| Stock / most ETFs | Finnhub quote (`FINNHUB_API_KEY`; missing key → no fetch) |
| Selected Finnish funds | Yahoo chart NAV, EUR → USD (same catalog route for Price-tab history) |
| Crypto | Binance 24hr ticker, batched; stables = 1, no network |
| Cash | Face 1, no network |

`getPricesForHoldings` defaults to **fresh** (`forceFresh` undefined → `true`) and retries missing symbols once. The dashboard pipeline passes **`forceFresh: false`** so a 60s Data Cache tag `prices` is reused across currency toggles and Plan reloads. The Refresh control `revalidateTag('prices')` then fetches again.

Unpriced names stay in the holdings list and in **cost**; they drop out of MV, allocation weights, 24h, and rebalance notionals.

---

## Writes

### Form

`transactionSchema` (Zod) → `createTransaction` / update / delete. Optional currency; if omitted, preferred currency. Cash quantities rounded to 2 dp. RLS still requires `user_id = auth.uid()`.

The schema currently allows `cash` + `buy`. Chat validation rejects that combo (`inflow`/`outflow` only). Forms should not rely on chat rules.

### Chat (prepare → confirm)

Pending drafts are **not** a first-class table. They are a `user_ai_insights` row (`feature_type = portfolio_analyst_pending_tx`) with a 30-minute TTL.

```
user text
  → validateTransactionDraft (catalog, €/$, cash actions)
  → prepare_transaction     staging; stores draft; confirmLevel hard | elevated_hard
  → user new message        "yes" / "confirm"  or  "confirm sell" if warned
  → assertWriteAllowed      not same HTTP turn as prepare; draft must exist
  → confirm_transaction     createTransactionRecord({ requireCurrency: true })
```

`assertWriteAllowed` is the only confirm gate. Watchlist add/remove are writes **without** that gate (commanding turn). They must not be sent through `assertWriteAllowed` (registry: `requiresConfirmation: false`).

Dry-run (`body.dryRun` or phrases like “dry run:” / “what would you do”) validates and describes. No draft persist, no insert, no forced news refresh.

---

## AI control plane

```
POST /api/portfolio-analyst
  sanitize messages (drop system/developer; cap size)
  resolveDryRun
  buildUserContext          -- currency, goals, investor one-liner, target mix, last analysis/news
  orchestrator streamText
       invoke_news_agent
       invoke_portfolio_analyst   -- may receive news handoff from THIS request only
       invoke_tax_agent
       invoke_portfolio_analysis_agent
  parent agent_runs + child runs
```

The orchestrator **does not** do portfolio math. Specialists call `getPortfolioData` / tax / news the same way the UI does.

`lib/aiTools/registry.ts` is the contract: `id`, owner, sideEffect (`read` | `staging` | `write` | `external` | `storage`), `requiresConfirmation`, permissions, `failureModes`. Tools return a `failureMode` mapped to `ask_user` / `fallback_simpler` / `retry_same` / `abort`.

**Progressive disclosure:** same engines in UI and chat (analysis popover, news popovers, tax modal, Plan sidebar). Chat is another client, not another calculator.

News handoff is a parsed slim payload (`parseNewsContextHandoff`). The analyst may cite those bullets; it may not invent headlines.

Admin: `agent_runs` (tokens, cost, confirm flags, parent/child). Eval fixtures inject a portfolio and must not write real txs (`evalMode` / dry-run).

---

## Plan (targets), not a third book

One `allocation_policies` row per user + `allocation_targets` (type weights summing to 100%, optional symbol % of **total** MV, capped by that type’s bucket).

`lib/allocationTargets/` is pure: validate, `computeDrift`, `suggestRebalance` (cash-first inplace, or new-cash buys only), `suggestMixFromProfile` (templates from Settings enums — the model does not invent weights).

Analyst tools `get_target_allocation`, `get_rebalance_plan`, `suggest_allocation_mix` are **read**. Applying a mix is a sidebar `upsertAllocationPolicy`. Suggestions are not transactions.

Investor profile (age band, horizon, risk, monthly contribution **band** in preferred currency) lives on `profiles`. Mix-from-profile requires risk + horizon; the Plan UI hides the suggest button until those exist.

Plan/Goals hydrate from the same document GET (`PlanSidebarHost` → `getAllocationWorkspace` / `getUserGoals`, sharing `getPortfolioData` via `React.cache`). They must not call `getPortfolioData` again on client mount — each Server Action is a new request and re-hits price APIs in dev.

---

## History

Daily USD snapshots: Edge Function `portfolio-snapshots` → `portfolio_snapshots` (RLS read). Performance chart: `getPortfolioSnapshots` + `lib/aggregateSnapshots.ts` (daily 90d / monthly 24m / yearly). That series is **not** rebuilt from transactions + historical marks on each page load.

Chart / Price-tab history uses the same catalog routing as live marks: `yahoo_chart` funds (e.g. OP Amerikka) load Yahoo daily bars, not Finnhub. Bars are stored USD (EUR NAV ÷ USD/EUR).

Optional benchmarks (SPY, URTH, BTC) overlay that chart as **price** series from `price_bars` (`syncSymbolHistory`: full backfill once, then gap-fill / cache_only). They are **not** fetched on the dashboard GET — only when a Performance-tab chip is on. Tracking error lives in `lib/benchmarks/` (daily MV vs price). Daily-linked TWR, vol, and max drawdown live in `lib/performance/` (cash inflow/outflow only; buys/sells are not CF). Headline excess is TWR − bench price return. Contribution is still ΔMV. Formulas: [calculation_logic.md](./calculation_logic.md).

---

## What tests are for

Unit tests under `lib/tests/` are the architecture’s proof for **money and gates**, not for CSS.

They are supposed to fail if: weighted-average / remaining basis / oversell cap changes; missing quote invents −100% P&L; mixed-currency P&L is scaled; cash nets raw faces; HMO applies to a loss; confirm accepts a jailbreak sentence; type weights do not sum to 100; excess/TE uses fill-forward or a single overlapping point; contribution % is shown when book Δ is 0; a cash deposit is treated as TWR; TWR invents a return when base MV is 0.

They are **not** supposed to prove RLS. User A vs user B is a policy + integration concern.

---

## Repo map

| Concern | Where |
|---|---|
| Dashboard pipeline | `lib/portfolioData.ts` |
| Reduce / enrich | `lib/calculatePortfolio.ts` |
| FX + cash + totals | `lib/convertToPreferred.ts`, `lib/currency.ts` |
| Live marks | `lib/prices/` |
| Targets / drift / mix | `lib/allocationTargets/` |
| Benchmarks / TE / contribution | `lib/benchmarks/` |
| TWR / vol / drawdown | `lib/performance/` |
| Formula sheet | `calculation_logic.md` |
| Tax | `lib/tax/` |
| Analyst math | `lib/portfolioAnalyst/` |
| Tool registry / confirm / dry-run / context | `lib/aiTools/` |
| Child-agent runs | `lib/agents/` |
| Server actions | `app/actions/` (`allocation.ts`, `transactions.ts`, `ai/…`) |
| Chat route | `app/api/portfolio-analyst/route.ts` |
| Plan UI | `app/(app)/plan/` |
| Tests | `lib/tests/` |
