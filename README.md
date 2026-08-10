# Portfolio Tracker

Personal investment tracker: **transactions as the source of truth**, live holdings & P&L, and a **multi-agent AI layer**

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS%20%2B%20Edge-green)
![AI](https://img.shields.io/badge/AI-xAI%20%2B%20Vercel%20AI%20SDK-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

<img width="1903" height="786" alt="portfoliotracker" src="https://github.com/user-attachments/assets/abc1da5b-5d1c-4d25-b9a6-163b84b71538" />

<img width="1906" height="862" alt="portfoliotracker_2" src="https://github.com/user-attachments/assets/8ba7ebd0-1be6-44e7-ad0f-9ef26a28e6e6" />

---

## Tech stack

- **Next.js** (App Router, RSC, Server Actions) + **TypeScript**
- **Supabase** — Auth, Postgres, RLS, Edge Functions
- **Vercel AI SDK** + **xAI** — streaming chat, tools, structured output
- **Tailwind CSS** + **shadcn/ui**, Recharts / Lightweight Charts
- **Zod** validation · **Vitest** (portfolio math, FX, tax, AI tool registry, eval scorer, …)
- **Vercel** hosting (preview deploys per branch)

## Features

- **Auth & private data** — Supabase Auth; per-user rows enforced with RLS
- **Transactions as source of truth** — buy/sell (assets), inflow/outflow (cash); holdings always derived
- **Live dashboard** — total value, 24h change, allocation, cost basis, unrealized P&L
- **Live prices** — stocks/ETFs (Finnhub), crypto (Binance), selected funds (catalog + NAV charts)
- **Performance history** — daily snapshots (Edge Function); Daily / Monthly / Yearly views
- **USD / EUR** preferred currency with FX on the dashboard
- **Goals** sidebar, **CSV export**, **privacy mode**
- **Admin** — access control; agent run logs & eval suite

## AI features

- **Contextual UI** — portfolio analysis next to Summary, holding news next to Holdings (icon popovers); same engines as chat
- **Multi-agent Assistant** — orchestrator routes to specialist agents (analyst, analysis, news, tax)
- **Portfolio analysis** — concentration / risk / structure bullets (hash short-circuit + ~1 min cooldown when regenerating)
- **Holding news & impact** — batch package + per-card tooltips; Finnhub equities / xAI search for crypto; ~1 full fetch per day
- **Finnish tax estimator** — navbar modal + chat agent; dual methods / HMO comparison (estimate only)
- **Smart CSV import** — structured model mapping → editable preview → same validation as manual entry
- **NL trade logging** — chat prepare → explicit user confirm → real transaction write
- **Dry-run** — “what would you do?” preview (no drafts/writes; no forced live news refresh)
- **Tool registry & control plane** — MCP-flavored metadata, read vs write, recovery strategies, soft/hard confirm
- **Agent observability** — parent/child run logs, tokens/cost, admin eval fixtures & scorer

---

## Why the AI layer matters

| Practice | In this app |
|----------|-------------|
| **Tool grounding** | Numbers from pure domain functions + tools—the model does not invent balances |
| **Multi-agent design** | Orchestrator chooses specialists; merges tool facts into the reply |
| **Permission-aware tools** | Explicit registry (`lib/aiTools`): side effects, permissions, cost tier, failure modes |
| **Safe writes** | Only `confirm_transaction` mutates the portfolio; hard confirm + soft warnings on risky prepares |
| **Recovery** | Stable `failureMode` → `recovery` (`ask_user` / `fallback_simpler` / `retry_same` / `abort`) |
| **User isolation** | Authenticated loaders + RLS; model only sees the current user |
| **Context pack** | Currency, goals, last analysis, news age injected into the orchestrator each turn |
| **Cost & rate limits** | Chat caps, news daily cooldown, analysis cooldown, latest-result storage |
| **Ops** | Parent/child `agent_runs`, estimated cost, admin eval scorecard |

**Stack detail:** Vercel AI SDK (`streamText`, tools, structured output) + xAI. Feature code under `app/actions/ai/<feature>/`. Chat: `POST /api/portfolio-analyst`.

---

## How it works

### Core product

```
Transactions (Postgres + RLS)
        ↓ pure reduce
   Holdings + cost basis + realized P&L
        ↓ live marks (server-side)
   Dashboard summary, allocation, charts
```

- **Single source of truth:** `transactions`—no separate holdings table.
- **Domain logic** in tested pure helpers (`lib/calculatePortfolio`, `lib/portfolioAnalyst`, `lib/tax`, …).
- **Prices** only for open holdings (never bulk-pricing full symbol catalogs).
- **Snapshots:** Edge Function → performance chart aggregation.

### AI architecture

```
User (dashboard icons / Assistant chat)
    → Server Actions / API
         → Context pack (currency, goals, last analysis, news age)
         → Orchestrator (streamText)
              ├── Portfolio Analyst   (holdings, P&L, what-if, NL trades)
              ├── Analysis Agent      (insight bullets)
              ├── News Agent          (holding news + impact)
              └── Tax Agent           (Finnish CG estimate)
         → Tool registry + write gates + recovery envelopes
         → pure domain (lib/) + storage
    → Supabase RLS + agent_runs (parent/child)
```

**Progressive disclosure**

| Feature | Primary UI | Chat |
|---------|------------|------|
| Analysis | Summary Orbit icon → popover | Analysis agent (same storage) |
| Holding news | Holdings Orbit icon → popover + card tooltips | News agent (same package) |
| Tax | Navbar modal | Tax agent (same engine) |
| Chat / logging | — | Assistant panel + prepare → confirm |

**Tool control**

| Class | Examples | Rules |
|-------|----------|--------|
| **Read** | holdings, allocation, scenarios, tax estimate | Safe to call freely |
| **Staging** | `prepare_transaction` | Draft only; warnings → elevated confirm (e.g. “confirm sell”) |
| **Write** | `confirm_transaction` only | Explicit confirm; elevated phrase when draft has warnings; never same turn as prepare |
| **External / storage** | news live fetch, analysis generation | Rate-limited; not portfolio writes |

**Dry-run:** body flag `dryRun: true` or phrasing like “dry run: …” / “what would you do if…”. Preview only—no pending draft, no tx write, no forced news refresh.

**Shared limits (chat and icons):** analysis ~1 minute between new runs when the portfolio changed (reuse if unchanged); holding news one full fetch per day (non-admin); chat soft rate limit.

### Agent observability & evaluation (admin)

- **Run log** — parent + child `agent_runs`: tools, latency, tokens, cost, confirm flags  
- **Admin menu → Agent observability** — Overview, Runs, Eval  
- **Eval suite** — fixtures under `lib/agentEval/fixtures/` (including soft-warn sell + dry-run log); pure `scoreCase` + live run via `POST /api/admin/agent-eval`  
- **Isolation** — fixture portfolio injection; eval/dry-run never write real transactions  

### Repo map (high level)

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

---

## Getting started

```bash
git clone <your-repo>
cd portfolio-tracker
npm install
```

1. Create a Supabase project and apply schema (see `AGENTS.md` for tables + RLS).
2. For agent logs / multi-agent runs, apply:

   - `supabase/migrations/20260807_agent_observability.sql`
   - `supabase/migrations/20260807_agent_runs_parent.sql`

3. Add `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # admin tools + agent_runs
FINNHUB_API_KEY=...           # optional; stock/ETF prices + equity news
XAI_API_KEY=...               # optional; chat, analysis, crypto news, CSV import
```

4. Run:

```bash
npm run dev
```

Sign up → add or import transactions → use **Summary / Holdings** Orbit icons for analysis and news, navbar **Assistant** for multi-agent chat (and dry-run previews), and the tax estimator from the navbar. Admins: shield menu → agent observability.

## Deploy

[Vercel](https://vercel.com) with the same env vars. Preview deploys via the usual GitHub integration. Portfolio history needs the `portfolio-snapshots` Edge Function deployed and scheduled (see `supabase/functions/portfolio-snapshots/`).

## License

Copyright (c) 2026 Based Code. All rights reserved.
