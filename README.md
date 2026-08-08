# Portfolio Tracker

A personal investment portfolio app built as a full-stack product: **transactions as the source of truth**, live holdings and P&L, and a **production-style multi-agent AI layer** that reads and writes through the same domain logic as the UI.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS%20%2B%20Edge-green)
![AI](https://img.shields.io/badge/AI-xAI%20%2B%20Vercel%20AI%20SDK-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

<img width="1903" height="786" alt="portfoliotracker" src="https://github.com/user-attachments/assets/abc1da5b-5d1c-4d25-b9a6-163b84b71538" />

<img width="1906" height="862" alt="portfoliotracker_2" src="https://github.com/user-attachments/assets/8ba7ebd0-1be6-44e7-ad0f-9ef26a28e6e6" />

## AI in this project

AI is a **first-class part of the product**, implemented with the same discipline as the rest of the stack: server-only keys, user-scoped data (Supabase RLS), and numbers that come from **tools and pure functions**—not from the model inventing balances.

**Stack:** [Vercel AI SDK](https://sdk.vercel.ai) (`streamText`, tools, structured output) + **xAI** models. Feature code lives under `app/actions/ai/<feature>/`. Portfolio chat streams from `app/api/portfolio-analyst` (orchestrator).

### Portfolio chat (multi-agent orchestrator)

Private sidebar chat over **this user’s** portfolio. An **orchestrator** routes work to specialist agents, then synthesizes the answer:

```
User message
    → Orchestrator (streamText)
         ├── invoke_portfolio_analyst
         ├── invoke_news_agent
         └── invoke_tax_agent
    → grounded reply (tool facts only)
```

| Agent | Role |
|--------|------|
| **Orchestrator** | Chooses agents, merges results; never invents numbers, news, or tax |
| **Portfolio Analyst** | Holdings, P&L, allocation, what-if scenarios, NL trade logging (`prepare` → confirm) |
| **News Agent** | Holding news (Finnhub equities / xAI search for crypto + impact); content-first brief; updates holding-news storage on live fetch |
| **Tax Agent** | Finnish capital-gains estimates (FIFO + weighted average vs hankintameno-olettama) via the same `estimateFinnishTax` / `lib/tax` engine as the tax modal |

**Example routing**

| User intent | Agents |
|-------------|--------|
| “Any important news on my biggest holdings?” | News only (presents bullets/impact, not cache meta) |
| “Tax if I sell half my BTC at market?” | Tax (`sellFraction` + live mark) |
| “YTD Finnish CGT?” | Tax (`mode: ytd`) |
| “Reconsider NVDA after news?” | News + Analyst (position context) |
| “Log: bought 0.5 BTC at $64000” | Analyst (prepare → user confirms) |

- **Streaming:** `@ai-sdk/react` `useChat` → `POST /api/portfolio-analyst`  
- **Trust rules:** news never invents P&L; analyst never invents news/tax; tax never invents rates  
- **Transcript:** session-only; soft rate limits on chat  
- **Observability:** parent `agent_runs` (`portfolio_orchestrator`) + child runs (`holding_news_agent`, `portfolio_analyst`, `tax_agent`)

Code: `app/actions/ai/orchestrator/`, `app/actions/ai/portfolio-analyst/agent.ts`, `holding-news/agent.ts`, `tax/agent.ts`, contracts in `lib/agents/`.

### Portfolio analysis

One-shot, structured bullets (concentration, risk, structure) over a compact portfolio summary. **Hash short-circuit** skips the model when the transaction set has not changed.

### Holding news & impact

- **Sidebar / holdings cards:** batch package via `generateHoldingNews` → shared `runHoldingNews` service.  
- **Chat:** News Agent (same pipeline) with deterministic `brief` for the orchestrator.  
- Live **web + X search** (xAI) for crypto; **Finnhub** company news for stocks/ETFs; impact synthesis; daily-style refresh gate for non-admins; previous package retained when nothing new.

### Finnish tax estimator

- **Navbar modal:** `TaxEstimatorModal` — what-if sell, YTD, or full pack; dual methods + HMO comparison.  
- **Chat:** Tax Agent (`invoke_tax_agent`) — same server action and pure domain (`lib/tax`).  
- Estimate only — not tax advice or a filing.

### Smart CSV import

Maps messy broker/exchange CSVs into app transactions with **structured model output**, a hard row cap before any AI call, an editable preview, then bulk save through the same validation as manual entry.

### Agent observability & evaluation (admin)

Admin-only tooling for production-style **AI ops** on multi-agent chat (and extensible feature keys).

- **Run log** — parent + child `agent_runs`: tools, latency, tokens, estimated cost, status, confirm flags  
- **Dashboard** — Admin menu → **Agent observability**: Overview, Runs (expand children), Eval  
- **Eval suite** — fixed fixtures + pure scorer; live one-click run via `POST /api/admin/agent-eval`  
- **Isolation** — eval injects fixture portfolio data; prepare/confirm never write real txs in eval mode  
- **Code** — `lib/agentObservability/`, `lib/agentEval/`, Vitest scorer tests  

Migrations:

- `supabase/migrations/20260807_agent_observability.sql` — tables  
- `supabase/migrations/20260807_agent_runs_parent.sql` — `parent_run_id` / `agent_role`  

### How the AI layer is built

| Concern | Approach |
|--------|----------|
| Correctness | Tools + unit-tested pure helpers (`lib/calculatePortfolio`, `lib/portfolioAnalyst`, `lib/tax`)—the model does not own the math |
| Multi-agent | Orchestrator only invokes specialists; content-first briefs for news and tax |
| Writes | Chat confirm and CSV import reuse `createTransactionRecord` / bulk paths; Zod on the way in |
| Isolation | Authenticated loaders + RLS; model only sees the current user |
| Cost control | Chat rate limits, news freshness/cooldown, analysis/CSV cooldowns, latest-result storage where applicable |
| Observability | Parent/child run logs + token/cost estimates; admin eval scorecard |
| Secrets | `XAI_API_KEY`, Finnhub, service role stay server-side |

## Core product

- **Auth & privacy** — Supabase Auth; per-user data with Postgres RLS  
- **Transactions as source of truth** — buy/sell (assets), inflow/outflow (cash); holdings always derived  
- **Live dashboard** — total value, 24h change, allocation, holdings with cost basis & unrealized P&L  
- **Prices** — stocks/ETFs (Finnhub), crypto (Binance public spot), selected mutual funds (catalog + Yahoo chart NAV); server-side  
- **Performance history** — daily snapshots (Supabase Edge Function); Daily / Monthly / Yearly charts  
- **Preferred currency** — USD or EUR with FX on the dashboard  
- **Goals** — target amounts and progress in a sidebar  
- **Finnish tax modal** — capital-gains estimator (same engine as Tax Agent)  
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
| Tests | Vitest (portfolio math, FX, prices, tax, news brief, agent eval scorer, …) |
| Hosting | **Vercel** (preview deploys per branch) |

## Architecture

```
UI / Chat
    │
    ├─ Server Actions / API routes
    │       ├─ prices (Finnhub / Binance / fund NAV)
    │       ├─ orchestrator ──► specialist agents ──► pure domain (lib/)
    │       └─ estimateFinnishTax / transactions / AI features
    │
    └─ Supabase (RLS) + agent_runs (service role, parent/child)
```

- **Single source of truth:** `transactions`  
- **Domain logic:** pure, tested functions—not scattered in components  
- **AI layout:** `actions/ai/storage.ts` + feature folders (`orchestrator`, `portfolio-analyst`, `holding-news`, `tax`, `portfolio-insights`, `csv-import`)  
- **Chat stream:** `app/api/portfolio-analyst` → orchestrator tools → specialists → parent/child `agent_runs`  
- **Agent eval:** `lib/agentEval` + pure scorer → admin suite `app/api/admin/agent-eval`  
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
2. For admin AI logs / multi-agent runs, apply:

   - `supabase/migrations/20260807_agent_observability.sql`  
   - `supabase/migrations/20260807_agent_runs_parent.sql`  

3. Add `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # admin tools + agent_runs writes
FINNHUB_API_KEY=...          # optional; stock/ETF prices + equity news
XAI_API_KEY=...              # optional; chat, analysis, crypto news, CSV import
```

4. Run:

```bash
npm run dev
```

Sign up → add or import transactions (form, CSV, or chat) → open **AI Insights** for multi-agent chat, analysis, and holding news. Use the navbar for the **Finnish tax estimator** modal. Admins: shield icon → **Agent observability**.

## Deploy

[Vercel](https://vercel.com) + the same env vars. Preview deploys work with the usual GitHub integration. Snapshots require the Supabase Edge Function deployed and scheduled separately (see `supabase/functions/portfolio-snapshots/`).

## License

Copyright (c) 2026 Based Code. All rights reserved.
