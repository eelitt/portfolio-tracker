# Architecture

How the tracker is put together. The [README](./README.md) is the short pitch; this file is the map.

## Core product

```
Transactions (Postgres + RLS)
        ↓ pure reduce
   Holdings + cost basis + realized P&L
        ↓ live marks (server-side)
   Dashboard summary, allocation, charts
```

- **Single source of truth:** `transactions`. There is no holdings table.
- **Domain logic** lives in tested helpers: `lib/calculatePortfolio.ts`, `lib/portfolioAnalyst/`, `lib/tax/`, `lib/convertToPreferred.ts`.
- **Prices** are fetched only for open holdings and watchlist symbols (Finnhub stocks/ETFs, Binance crypto, Yahoo-chart NAVs for selected funds). Never for the full JSON catalogs.
- **Snapshots:** Supabase Edge Function `portfolio-snapshots` writes daily USD marks; the Performance chart aggregates them (`lib/aggregateSnapshots.ts`).

Auth is Supabase. Row Level Security is `user_id = auth.uid()` on user tables. Server Actions return `{ data?: T; error?: string }`. Inputs go through Zod before any write.

## AI layer

```
User (dashboard icons / Assistant chat)
    → Server Actions / API
         → Context pack (currency, goals, last analysis, news age)
         → Orchestrator (streamText)
              ├── Portfolio Analyst   (holdings, P&L, what-if, NL trades, watchlist)
              ├── Analysis Agent      (insight bullets)
              ├── News Agent          (holding / watchlist news + impact)
              └── Tax Agent           (Finnish CG estimate)
         → Tool registry + write gates + recovery envelopes
         → pure domain (lib/) + storage
    → Supabase RLS + agent_runs (parent/child)
```

Chat: `POST /api/portfolio-analyst`. Feature code: `app/actions/ai/<feature>/`. Registry: `lib/aiTools/`.

The model does not invent balances. Numbers come from tools that call the same pure functions the dashboard uses.

### Progressive disclosure

Same engines in the UI and in chat.

| Feature | Primary UI | Chat |
|---------|------------|------|
| Analysis | Summary Orbit icon → popover | Analysis agent (same storage) |
| Holding / watchlist news | Section Orbit icon → popover + row/card tooltips | News agent (same package per feature type) |
| Tax | Navbar modal | Tax agent (same engine) |
| Logging / watchlist mutate | Forms | Analyst: prepare → confirm (trades); watchlist add/remove on the commanding turn |

### Tool control

| Class | Examples | Rules |
|-------|----------|--------|
| **Read** | holdings, allocation, scenarios, tax estimate, list watchlist | Safe to call freely |
| **Staging** | `prepare_transaction` | Draft only; warnings → elevated confirm (e.g. “confirm sell”) |
| **Write** | `confirm_transaction` (money); watchlist add/remove (not a confirm turn) | Trades: explicit confirm in a **new** turn; never same turn as prepare |
| **External / storage** | news live fetch, analysis generation | Rate-limited; not portfolio writes |

**Dry-run:** `dryRun: true` on the API body, or phrasing like “dry run: …” / “what would you do if…”. Validates and describes; no pending draft, no transaction write, no forced live news refresh.

**Shared limits:** analysis ~1 minute between new runs when the portfolio changed (reuse if unchanged); holding news and watchlist news each have their own 24h live-fetch cooldown (non-admin); chat has a soft rate limit.

**Recovery:** tools return a stable `failureMode` mapped to `ask_user` / `fallback_simpler` / `retry_same` / `abort` (`lib/aiTools/recovery.ts`).

## Observability and eval (admin)

- **`agent_runs`** — parent + child: tools, latency, tokens, estimated cost, confirm flags.
- **Admin menu → Agent observability** — Overview, Runs, Eval.
- **Eval suite** — fixtures in `lib/agentEval/fixtures/`; pure `scoreCase`; live run via `POST /api/admin/agent-eval`.
- **Isolation** — fixture portfolio injection; eval/dry-run must not write real transactions.

## Repo map

| Area | Where |
|------|--------|
| Dashboard UI | `app/(app)/dashboard/` |
| Assistant UI | `app/(app)/ai-insights/` |
| AI features | `app/actions/ai/` + `app/api/portfolio-analyst` |
| Tool registry / control | `lib/aiTools/` |
| Multi-agent contracts | `lib/agents/` |
| Portfolio math | `lib/calculatePortfolio.ts`, `lib/portfolioAnalyst/` |
| Tax domain | `lib/tax/` |
| Observability & eval | `lib/agentObservability/`, `lib/agentEval/` |
| Unit tests | `lib/tests/` |

