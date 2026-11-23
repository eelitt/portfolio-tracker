# Portfolio Tracker

A personal investment platform where an orchestrator works with specialist agents to help you understand your portfolio, explore market news, analyze investments, and manage transactions.

Each agent has a focused role and access to specific tools. The orchestrator brings their work together, while explicit permissions and user confirmations keep financial actions under control.

The numbers are never up to AI. Transactions are the single source of truth. Holdings, cost basis, and P&L are calculated deterministically from your transaction history. AI can analyze the results, but it cannot invent or silently change them.

Built as a real, deployable product — with private user data, live market prices, and visibility into how agents work together.


![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS%20%2B%20Edge-green)
![AI](https://img.shields.io/badge/AI-xAI%20%2B%20Vercel%20AI%20SDK-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

See it in action:

Dashboard:
<img width="1802" height="927" alt="image" src="https://github.com/user-attachments/assets/0f562436-dd8a-412b-8fa6-7dbdb8c5703b" />

Holding intelligence & news:
<img width="1895" height="920" alt="image" src="https://github.com/user-attachments/assets/e56d0992-9ae1-4534-87e1-43e41bc10efa" />

Multi-agent orchestration & observability:
<img width="1885" height="914" alt="image" src="https://github.com/user-attachments/assets/56a6e706-f781-43a4-8fe6-6e4fccb7bd15" />


## Why this is different

- Holdings are never stored — they are reduced from transactions (weighted average cost) and unit-tested.
- Live prices run only on the server (Finnhub / Binance / fund NAV); symbol catalogs are never bulk-quoted.
- Row Level Security isolates every user; the model only sees the signed-in session.
- Portfolio writes go prepare → explicit confirm; one write tool; warned sells need a stronger phrase.
- Tools are registered with side effects, permissions, and a recovery map; dry-run previews without writing.
- Admin eval fixtures + parent/child run logs (tokens, cost, confirm flags) — not “trust the demo.”
- Finnish capital-gains estimate compares FIFO / weighted average vs hankintameno-olettama (estimate only).

## Tech stack

- **Next.js** (App Router, RSC, Server Actions) + **TypeScript**
- **Supabase** — Auth, Postgres, RLS, Edge Functions
- **Vercel AI SDK** + **xAI** — streaming chat, tools, structured output
- **Tailwind CSS** + **shadcn/ui**, Recharts / Lightweight Charts
- **Zod** validation · **Vitest** (portfolio math, FX, tax, AI tool registry, eval scorer, …)
- **Vercel** hosting (preview deploys per branch)

## Live demo + quick start

**[Live demo](portfolio-tracker-flame-kappa.vercel.app)**

```bash
git clone <your-repo>
cd portfolio-tracker
npm install
```

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # admin tools + agent_runs
FINNHUB_API_KEY=...           # optional; stock/ETF prices + equity news
XAI_API_KEY=...               # optional; chat, analysis, crypto news, CSV import
```

```bash
npm run dev
```

Sign up, record or import transactions, open the dashboard. Assistant / analysis / news stay off if `XAI_API_KEY` is unset.

## Architecture

```
Transactions (Postgres + RLS)
        ↓ pure reduce
   Holdings + cost basis + realized P&L
        ↓ live marks (server-side)
   Dashboard summary, allocation, charts
```

The assistant is an orchestrator over specialist tools with a permission registry and confirmations on writes — not a free-form agent against your balances.

## Key design decisions

- **Transactions only.** No holdings table to drift out of sync with trades.
- **Prices never leave the server.** API keys stay off the client; quote only open positions.
- **AI may stage a draft; only confirm writes.** The model does not update Postgres on the same turn as prepare.
- **Test the money.** Vitest covers cost basis, sells, FX, tax helpers, and the tool registry — not the React tree.

**At scale I’d change:** a shared quote cache and Finnhub quota strategy; snapshot job concurrency.

## License

Copyright (c) 2026 Based Code. All rights reserved.
