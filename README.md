# Portfolio Tracker

A personal investment tracker where **transactions are the only source of truth** — holdings, cost basis, and P&L are derived, and the AI layer is not allowed to invent numbers.

Built as a real product (auth, private data, live marks, deployable), not a chatbot with a table glued on.


![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS%20%2B%20Edge-green)
![AI](https://img.shields.io/badge/AI-xAI%20%2B%20Vercel%20AI%20SDK-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

Dashboard:
<img width="1896" height="917" alt="git1" src="https://github.com/user-attachments/assets/9d47cc24-3001-4181-987d-287edcbe5219" />
Holding news:

<img width="1899" height="920" alt="git4" src="https://github.com/user-attachments/assets/cdda1f88-e3d4-4f05-a41f-54b7bd1a01b4" />
User menu, Watchlist and Transaction History:
<img width="1909" height="920" alt="git3" src="https://github.com/user-attachments/assets/776fb231-eb79-4dfc-93da-6c14eb305714" />
Charts:
<img width="1905" height="922" alt="git2" src="https://github.com/user-attachments/assets/6a48b62e-892a-48b2-a67d-2543be6fab0b" />


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

Full write-up: [architecture.md](./architecture.md).

## Key design decisions

- **Transactions only.** No holdings table to drift out of sync with trades.
- **Prices never leave the server.** API keys stay off the client; quote only open positions.
- **AI may stage a draft; only confirm writes.** The model does not update Postgres on the same turn as prepare.
- **Test the money.** Vitest covers cost basis, sells, FX, tax helpers, and the tool registry — not the React tree.

**At scale I’d change:** a shared quote cache and Finnhub quota strategy; snapshot job concurrency; still no persisted chat (session-only is the right default until there is a real product reason).

## License

Copyright (c) 2026 Based Code. All rights reserved.
