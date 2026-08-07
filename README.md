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

### Portfolio Analyst (tool-first chat)

Private sidebar chat over **this user’s** portfolio only.

- **Grounded tools** load the same pipeline as the dashboard (`getPortfolioData`, `calculateHoldings`, live prices)—summary, filtered holdings, allocation, realized P&L, transactions, what-if sell / price shocks
- **Streaming** responses via the AI SDK and `@ai-sdk/react` `useChat`
- **Natural-language trade logging**: model proposes a draft (`prepare`) → user confirms → server writes through the **same insert path** as the manual form (including sell → Available Cash). Pending draft is stored server-side so a short “confirm” works
- **Finnish capital-gains estimates** as a dedicated tool (FIFO + weighted average vs hankintameno-olettama; estimate only, not tax advice)
- **Refuse-by-default** scope: portfolio and logging stay in bounds; general market advice and off-topic chat are declined
- Session-only transcript; separate soft rate limits from other AI features

### Portfolio analysis

One-shot, structured bullets (concentration, risk, structure) over a compact portfolio summary. **Hash short-circuit** skips the model when the transaction set has not changed.

### Holding news & impact

Live **web + X search** (xAI) for top holdings by market value, with per-symbol bullets and a short impact read (tone / outlook). Surfaces in the AI sidebar and on holdings cards; daily refresh gate; previous package retained if a re-fetch finds nothing new.

### Smart CSV import

Maps messy broker/exchange CSVs into app transactions with **structured model output**, a hard row cap before any AI call, an editable preview, then bulk save through the same validation as manual entry.

### How the AI layer is built

| Concern | Approach |
|--------|----------|
| Correctness | Tools + unit-tested pure helpers (`lib/calculatePortfolio`, `lib/portfolioAnalyst`, `lib/tax`)—the model does not own the math |
| Writes | Chat confirm and CSV import reuse `createTransactionRecord` / bulk paths; Zod validation on the way in |
| Isolation | Authenticated server loaders + RLS; the model only ever sees the current user |
| Cost control | Global cooldown for analysis/CSV, chat message caps, news once-per-day live search, latest-result storage where applicable |
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
| Tests | Vitest (portfolio math, FX, prices, analyst helpers, tax estimator, …) |
| Hosting | **Vercel** (preview deploys per branch) |

## Architecture

```
UI / Chat ──► Server Actions & API routes ──► pure domain (lib/) ──► Supabase (RLS)
                    │
                    ├── prices (Finnhub / Binance / fund NAV)
                    └── AI (xAI via AI SDK): tools call the same loaders & writers
```

- **Single source of truth:** `transactions`  
- **Domain logic:** pure, tested functions—not scattered in components  
- **AI layout:** `actions/ai/storage.ts` + feature folders (`portfolio-analyst`, `portfolio-insights`, `holding-news`, `csv-import`)  
- **Analyst stream:** `app/api/portfolio-analyst` → tools → user-scoped portfolio data and optional confirm write  
- **Shared writes:** form, CSV import, and chat confirm share insert + cash-credit rules  
- **History:** Edge Function → `portfolio_snapshots` → performance chart aggregation  

## Getting started

```bash
git clone <your-repo>
cd portfolio-tracker
npm install
```

1. Create a Supabase project and apply schema (see `AGENTS.md` for tables + RLS).  
2. Add `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
FINNHUB_API_KEY=...          # optional; stock/ETF prices
XAI_API_KEY=...              # optional; AI Insights (analyst, analysis, news, CSV import)
```

3. Run:

```bash
npm run dev
```

Sign up → add or import transactions (form, CSV, or Portfolio Analyst chat) → open **AI Insights** from the navbar.

## Deploy

[Vercel](https://vercel.com) + the same env vars. Preview deploys work with the usual GitHub integration. Snapshots require the Supabase Edge Function deployed and scheduled separately (see `supabase/functions/portfolio-snapshots/`).

## License

Copyright (c) 2026 Based Code. All rights reserved.
