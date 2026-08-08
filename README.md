# Portfolio Tracker

A personal investment portfolio app built as a full-stack product: **transactions as the source of truth**, live holdings and P&L, and a **production-style AI layer** that reads and writes through the same domain logic as the UI.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS%20%2B%20Edge-green)
![AI](https://img.shields.io/badge/AI-xAI%20%2B%20Vercel%20AI%20SDK-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

<img width="1903" height="786" alt="portfoliotracker" src="https://github.com/user-attachments/assets/abc1da5b-5d1c-4d25-b9a6-163b84b71538" />

<img width="1906" height="862" alt="portfoliotracker_2" src="https://github.com/user-attachments/assets/8ba7ebd0-1be6-44e7-ad0f-9ef26a28e6e6" />

## AI in this project

AI is a **first-class part of the product**, implemented with the same discipline as the rest of the stack: server-only keys, user-scoped data (Supabase RLS), and numbers that come from **tools and pure functions**—not from the model inventing balances.

**Stack:** [Vercel AI SDK](https://sdk.vercel.ai) (`streamText`, tools, structured output) + **xAI** models. Feature code lives under `app/actions/ai/<feature>/`; the chat agent streams from `app/api/portfolio-analyst`.

### Portfolio chat (multi-agent orchestrator)

Private sidebar chat over **this user’s** portfolio. An **orchestrator** routes to specialist agents (extensible registry):

| Agent | Role |
|--------|------|
| **Orchestrator** | Chooses agents, synthesizes the final answer; never invents numbers or news |
| **Portfolio Analyst** | Tool-first math: holdings, P&L, allocation, scenarios, Finnish tax tool, NL trade logging (prepare → confirm) |
| **News Agent** | Holding news research (Finnhub / xAI search + impact); updates the holding-news cache when a live fetch runs |

- Example: *“Is there news that should make me reconsider my NVDA position?”* → news agent + analyst (position context) → grounded combined answer  
- **Streaming** via AI SDK `useChat` → `app/api/portfolio-analyst` (orchestrator route)  
- **Trust rules:** news agent never invents portfolio numbers; analyst never invents news (only structured `newsContext` from the news agent)  
- Session-only transcript; soft rate limits; parent/child `agent_runs` for observability

### Portfolio analysis

One-shot, structured bullets (concentration, risk, structure) over a compact portfolio summary. **Hash short-circuit** skips the model when the transaction set has not changed.

### Holding news & impact

Live **web + X search** (xAI) for top holdings by market value, with per-symbol bullets and a short impact read (tone / outlook). Surfaces in the AI sidebar and on holdings cards; daily refresh gate; previous package retained if a re-fetch finds nothing new.

### Smart CSV import

Maps messy broker/exchange CSVs into app transactions with **structured model output**, a hard row cap before any AI call, an editable preview, then bulk save through the same validation as manual entry.

### Agent observability & evaluation (admin)

Admin-only tooling for production-style **AI ops** on the Portfolio Analyst (extensible to other AI features via a shared `feature` key).

- **Run log** — every analyst request best-effort writes `agent_runs`: tools called (args/results redacted & truncated), step count, latency, tokens, estimated cost, success/error/partial, confirm-gate flags  
- **Dashboard** — Admin menu → **Agent observability** with Overview (rates, cost, top tool errors), Runs (table + tool timeline), and Eval  
- **Eval suite** — fixed JSON fixtures (seed portfolio + prompt + expectations); live one-click run from admin (`POST /api/admin/agent-eval`, long `maxDuration`); pure scorer checks tool selection, oracle numbers vs tool results, and confirm/refusal policy  
- **Isolation** — eval injects fixture portfolio data into tools (`evalMode`); prepare/confirm never write real transactions; tables are **service-role only** (no user RLS reads)  
- **Code** — `lib/agentObservability/` (types, redact, cost, score, recordRun), `lib/agentEval/` (fixtures, suite), Vitest on the pure scorer  

Schema: `supabase/migrations/20260807_agent_observability.sql` (`agent_runs`, `agent_eval_runs`, `agent_eval_results`).

### How the AI layer is built

| Concern | Approach |
|--------|----------|
| Correctness | Tools + unit-tested pure helpers (`lib/calculatePortfolio`, `lib/portfolioAnalyst`, `lib/tax`)—the model does not own the math |
| Writes | Chat confirm and CSV import reuse `createTransactionRecord` / bulk paths; Zod validation on the way in |
| Isolation | Authenticated server loaders + RLS; the model only ever sees the current user |
| Cost control | Global cooldown for analysis/CSV, chat message caps, news once-per-day live search, latest-result storage where applicable |
| Observability | Admin run logs + token/cost estimates; eval scorecard for tool/oracle/policy checks |
| Secrets | `XAI_API_KEY` and price keys stay server-side—never shipped to the client |

## Core product

- **Auth & privacy** — Supabase Auth; per-user data with Postgres RLS  
- **Transactions as source of truth** — buy/sell (assets), inflow/outflow (cash); holdings are always derived  
- **Live dashboard** — total value, 24h change, allocation, holdings with cost basis & unrealized P&L  
- **Prices** — stocks/ETFs (Finnhub), crypto (Binance public spot), selected mutual funds (catalog + Yahoo chart NAV); all server-side  
- **Performance history** — daily snapshots (Supabase Edge Function); Daily / Monthly / Yearly charts  
- **Preferred currency** — USD or EUR with FX on the dashboard  
- **Goals** — target amounts and progress in a sidebar  
- **Export** — CSV for holdings and transactions  
- **Admin** — user access flags; agent run logs & eval suite  

## Tech stack

| Area | Choice |
|------|--------|
| Framework | **Next.js** App Router, Server Actions, RSC |
| Language | **TypeScript** (strict) |
| Auth / DB | **Supabase** (Auth + Postgres + RLS) |
| Jobs | **Supabase Edge Functions** (portfolio snapshots) |
| AI | **Vercel AI SDK** + **xAI** (streaming tools, structured output, live search) |
| UI | Tailwind CSS, shadcn/ui, Lucide, Sonner |
| Charts | Recharts |
| Validation | Zod (+ React Hook Form where forms need it) |
| Tests | Vitest (portfolio math, FX, prices, analyst helpers, tax estimator, agent eval scorer, …) |
| Hosting | **Vercel** (preview deploys per branch) |

## Architecture

```
UI / Chat ──► Server Actions & API routes ──► pure domain (lib/) ──► Supabase (RLS)
                    │
                    ├── prices (Finnhub / Binance / fund NAV)
                    ├── AI (xAI via AI SDK): tools call the same loaders & writers
                    └── agent_runs (service role): tools, latency, tokens, eval links
```

- **Single source of truth:** `transactions`  
- **Domain logic:** pure, tested functions—not scattered in components  
- **AI layout:** `actions/ai/storage.ts` + feature folders (`portfolio-analyst`, `portfolio-insights`, `holding-news`, `csv-import`)  
- **Analyst stream:** `app/api/portfolio-analyst` → tools → user-scoped portfolio data and optional confirm write; `onStepFinish` / `onFinish` → `agent_runs`  
- **Agent eval:** fixtures + pure scorer (`lib/agentEval`, `lib/agentObservability/score`) → admin suite via `app/api/admin/agent-eval`  
- **Shared writes:** form, CSV import, and chat confirm share insert + cash-credit rules  
- **History:** Edge Function → `portfolio_snapshots` → performance chart aggregation  
- **Admin:** navbar shield menu (user management, agent observability)—modals, not separate app routes  

## Getting started

```bash
git clone <your-repo>
cd portfolio-tracker
npm install
```

1. Create a Supabase project and apply schema (see `AGENTS.md` for tables + RLS).  
2. Apply agent observability migration if you use admin AI logs/eval:  
   `supabase/migrations/20260807_agent_observability.sql`  
3. Add `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # admin tools (users, agent runs/eval writes)
FINNHUB_API_KEY=...          # optional; stock/ETF prices
XAI_API_KEY=...              # optional; AI Insights (analyst, analysis, news, CSV import)
```

4. Run:

```bash
npm run dev
```

Sign up → add or import transactions (form, CSV, or Portfolio Analyst chat) → open **AI Insights** from the navbar. Admins: shield icon → **Agent observability**.

## Deploy

[Vercel](https://vercel.com) + the same env vars. Preview deploys work with the usual GitHub integration. Snapshots require the Supabase Edge Function deployed and scheduled separately (see `supabase/functions/portfolio-snapshots/`).

## License

Copyright (c) 2026 Based Code. All rights reserved.
