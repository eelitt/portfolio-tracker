# Portfolio Tracker

Investment portfolio app: track stock, ETF, crypto, and cash positions, see live P&L, and use AI for grounded analysis, CSV import, and holding news.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS%20%2B%20Edge-green)
![AI](https://img.shields.io/badge/AI-xAI%20Grok%20%2B%20Vercel%20AI%20SDK-purple)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## ✨ What it does

- 🔐 **Auth & privacy** — Supabase Auth; per-user data with Postgres RLS
- 📒 **Transactions as source of truth** — buy/sell (assets) and inflow/outflow (cash); holdings are always computed, not stored
- 📊 **Live dashboard** — total value, 24h change, allocation pie, holdings with cost basis & unrealized P&L
- 📈 **Prices** — stocks/ETFs via Finnhub; crypto via CoinGecko (server-side only)
- 📉 **Performance history** — daily portfolio snapshots (Supabase Edge Function) with Daily / Monthly / Yearly charts
- 💱 **Preferred currency** — USD or EUR display with FX conversion on the dashboard
- 🎯 **Goals** — target amounts with progress in a sidebar
- 📥 **CSV** — export holdings/transactions; **AI-assisted import** from messy broker/exchange files
- 🤖 **AI Insights** — tool-grounded portfolio chat, one-shot analysis, holding news + impact

## 🛠️ Tech stack

| | Area | Choice |
|---|------|--------|
| ⚡ | Framework | **Next.js 16** App Router, Server Actions, RSC |
| 📘 | Language | **TypeScript** (strict) |
| 🗄️ | Auth / DB | **Supabase** (Auth + Postgres + RLS) |
| ⚙️ | Jobs | **Supabase Edge Functions** (daily portfolio snapshots) |
| 🧠 | AI | **Vercel AI SDK** + **xAI** — tools, structured output, live search |
| 🎨 | UI | Tailwind CSS, shadcn/ui, Lucide, Sonner |
| 📉 | Charts | Recharts |
| ✅ | Validation | Zod + React Hook Form |
| 🧪 | Tests | Vitest (portfolio math, FX, price helpers, analyst scenarios) |
| ☁️ | Hosting | **Vercel** (preview deploys per branch) |

## 🤖 AI features (xAI)

All model traffic stays **server-side**. Feature code lives under `app/actions/ai/<feature>/`; the chat agent streams from a dedicated route.

### 💬 Portfolio Analyst
- Private chat over **this user’s** holdings, cost basis, P&L, allocation, and what-if scenarios
- **Tool-first** — facts come from the same pure calculation path as the dashboard (`calculateHoldings` / enriched prices), not free-form invention
- Tools: summary, filtered holdings, allocation, realized P&L, transactions, sell / price-shock simulations
- **NL transaction entry** — draft → user confirm; requires explicit **€/$** and a catalog ticker; no preferred-currency guess on chat path
- Strict scope: refuses general advice and off-topic requests; non-advisory disclaimer in UI + system prompt
- Streaming via **Vercel AI SDK** (`streamText` + tools) and `@ai-sdk/react` `useChat`
- Session-only transcript (clears when the panel closes); soft per-user rate limit separate from other AI features

### 📋 Portfolio analysis
- Up to 6 concise bullets on concentration, risk, and structure
- ♻️ **Hash short-circuit** — skips the model when the transaction set is unchanged
- Compact summary only (no full transaction dump)

### 📰 Holding news
- 🌐 Live **web + X search** (xAI) for top positions by market value
- Per-symbol bullets + **impact** (tone, outlook, short points)
- AI sidebar + **holdings card tooltips** (collapsible news / impact)
- ⏱️ **24h** refresh cooldown; keeps previous news if a re-fetch finds nothing new
- Latest package per user in `user_ai_insights` (jsonb)

### 📎 Smart CSV import
- Maps arbitrary broker/exchange CSVs into app transactions via structured output
- 🛡️ **200-row client cap** before any AI call
- Editable preview → bulk import with the same validation as manual entry

### 🔒 Cost & safety controls
- Global **60s** AI cooldown for analysis / CSV (not every chat turn)
- Analyst chat: rolling message cap + short inter-message gap
- Holding news **once-per-day** live search gate
- Latest stored result only per `(user, feature_type)` where applicable
- Structured outputs via **Zod** where applicable
- RLS + authenticated server loaders so the model only ever sees the current user’s data

## ☁️ Cloud & ops

- **Vercel** — production + GitHub preview deployments
- **Supabase** — Auth, Postgres, RLS; Edge Function `portfolio-snapshots` writes daily MV/cost series
- **Server-only integrations** — Finnhub, CoinGecko, xAI (keys in env, never bundled to the client)
- **Price cache** — tag-based revalidation (`prices`) with a manual dashboard refresh

## 🏗️ Architecture

- 🧩 **Single source of truth:** `transactions` table  
- 🧮 **Domain logic:** pure functions in `lib/calculatePortfolio.ts` + `lib/portfolioAnalyst/` (unit tested)  
- 🔑 **Secrets:** price APIs + xAI only on the server  
- 📁 **AI layout:** `actions/ai/storage.ts` + feature folders (`portfolio-analyst`, `portfolio-insights`, `holding-news`, `csv-import`)  
- 🔌 **Analyst stream:** `app/api/portfolio-analyst` → tools → user-scoped `getPortfolioData`  
- 📸 **History:** Edge Function → `portfolio_snapshots` → Performance chart aggregation

## 🚀 Getting started

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

3. ▶️ Run:

```bash
npm run dev
```

Sign up → add or import transactions → open **AI Insights** from the navbar (Portfolio Analyst, analysis, holding news).

## 📦 Deploy

[Vercel](https://vercel.com) + the same env vars. Preview deploys work with the usual GitHub integration. Snapshots require the Supabase Edge Function deployed and scheduled separately (see `supabase/functions/portfolio-snapshots/`).

## License

MIT
