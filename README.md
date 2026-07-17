# Portfolio Tracker

Investment portfolio app: track stock, ETF, crypto, and cash positions, see live P&L, and use AI for portfolio analysis, CSV import, and holding news.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS-green)
![AI](https://img.shields.io/badge/AI-xAI%20Grok%20%2B%20Vercel%20AI%20SDK-purple)

## ✨ What it does

- 🔐 **Auth & privacy** — Supabase Auth; per-user data with Postgres RLS
- 📒 **Transactions as source of truth** — buy/sell (assets) and inflow/outflow (cash); holdings are always computed, not stored
- 📊 **Live dashboard** — total value, 24h change, allocation pie, holdings with cost basis & unrealized P&L
- 📈 **Prices** — stocks/ETFs via Finnhub; crypto via CoinGecko (server-side only)
- 🎯 **Goals** — target amounts with progress in a sidebar
- 📥 **CSV** — export holdings/transactions; **AI-assisted import** from messy broker/exchange files
- 🤖 **AI Insights** — portfolio analysis, holding news + impact, in a dedicated sidebar

## 🛠️ Tech stack

| | Area | Choice |
|---|------|--------|
| ⚡ | Framework | **Next.js 16** App Router, Server Actions, RSC |
| 📘 | Language | **TypeScript** (strict) |
| 🗄️ | Auth / DB | **Supabase** (Auth + Postgres + RLS) |
| 🧠 | AI | **Vercel AI SDK** + **xAI Grok** (`grok-4.3`) |
| 🎨 | UI | Tailwind CSS, shadcn/ui, Lucide, Sonner |
| 📉 | Charts | Recharts |
| ✅ | Validation | Zod + React Hook Form |
| 🧪 | Tests | Vitest (portfolio math + price service) |
| ☁️ | Hosting | Vercel |

## 🤖 AI features (xAI)

All LLM calls run in **server actions** — `XAI_API_KEY` never reaches the browser. Feature code lives under `app/actions/ai/<feature>/`.

### 📋 Portfolio analysis
- Up to 6 actionable bullets on concentration, risk, and structure
- ♻️ **Hash short-circuit** — skips the model when the transaction set is unchanged
- Compact summary only (no full transaction dump)

### 📰 Holding news
- 🌐 Live **web + X search** (xAI tools) for top positions by market value
- Per-symbol bullets + **impact** (tone, outlook, short points)
- AI sidebar + **holdings card tooltips** (collapsible news / impact)
- ⏱️ **24h** refresh cooldown; keeps previous news if a re-fetch finds nothing new
- Latest package per user in `user_ai_insights` (jsonb)

### 📎 Smart CSV import
- Maps arbitrary broker/exchange CSVs into app transactions via structured output
- 🛡️ **200-row client cap** before any AI call
- Editable preview → bulk import with the same validation as manual entry

### 🔒 Cost & safety controls
- Global **60s** AI cooldown for analysis / CSV
- Holding news **once-per-day** live search gate
- Latest result only per `(user, feature_type)`
- Structured outputs via **Zod** where applicable

## 🏗️ Architecture

- 🧩 **Single source of truth:** `transactions` table  
- 🧮 **Domain logic:** pure functions in `lib/calculatePortfolio.ts` (unit tested)  
- 🔑 **Secrets:** price APIs + xAI only in Server Actions  
- 📁 **AI layout:** `actions/ai/storage.ts` + feature folders (`portfolio-insights`, `holding-news`, `csv-import`)

## 🚀 Getting started

```bash
git clone <your-repo>
cd portfolio-tracker
npm install
```

1. Create a Supabase project and apply schema (see `AGENTS.md` for tables + RLS).
2.  Add `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
FINNHUB_API_KEY=...          # optional; stock/ETF prices
XAI_API_KEY=...              # optional; AI Insights + AI CSV import
```

3. ▶️ Run:

```bash
npm run dev
```

Sign up → add or import transactions → open **AI Insights** from the navbar.

## 📦 Deploy

[Vercel](https://vercel.com) + the same env vars. Preview deploys work with the usual GitHub integration.

## License

MIT
