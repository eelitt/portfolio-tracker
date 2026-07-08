# Portfolio Tracker

**Next.js** investment portfolio tracker. Users securely record stock and crypto buy/sell transactions; the app computes holdings, cost basis, and P&L in real time. Includes goals tracking and **AI portfolio analysis** powered by xAI Grok.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20RLS-green)
![AI](https://img.shields.io/badge/AI-xAI%20Grok%20%2B%20Vercel%20SDK-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

## Core Features

- Record buy/sell transactions for stocks (Finnhub) and crypto (CoinGecko)
- Dashboard: total value, 24h change ($ + %), allocation pie chart, holdings table with cost basis and P&L
- Goals sidebar with progress tracking
- Transaction history with CSV export (transactions + current holdings)
- Private per-user data only

## 🤖 AI Insights — xAI Integration

The **"AI Insights"** button in the navbar opens a fixed left sidebar. Portfolio Analysis is fully implemented.

- **Smart cost controls**:
  - Portfolio hash (`computePortfolioHash` — SHA-256 over canonical transactions) skips the API entirely when data is unchanged
  - 60-second per-user cooldown (`profiles.last_ai_call_at`)
- **Minimal data exposure** — only a compact summary (value, 24h %, top holdings + allocation & P&L) is ever sent. Raw transactions stay private.
- **Structured & reliable** — Vercel AI SDK `generateObject` + Zod schema guarantees clean `insights: string[]` (≤6 bullets)
- **Lean storage** — only the latest result per (user, feature_type) is kept via upsert in `user_ai_insights`
- **Excellent UX** — "Last analyzed …", "UNUSED" ribbon on un-used features, loading states, cached banners, and a permanent disclaimer

## 🛠 Tech Stack

- **Next.js 16** (App Router, Server Actions, React Server Components, Suspense streaming)
- **Supabase** — Auth, Postgres, Row Level Security (RLS)
- **AI** — Vercel AI SDK + **xAI Grok** (`grok-4.3`) with structured outputs
- **UI** — Tailwind CSS + shadcn/ui + Sonner + Lucide
- **Charts** — Recharts
- **Validation & Types** — Zod + TypeScript (strict)
- **Testing** — Vitest (core portfolio calculations + price service)
- **Deployment** — Vercel

## Architecture Highlights

- `transactions` table is the only source of truth
- All holdings & summary logic lives in `lib/calculatePortfolio.ts` (pure functions, extensively tested)
- Price fetching and AI generation are Server Actions (keys never reach the client)
- Sidebars use localStorage + custom events for open/close coordination
- Live updates: components listen for `'portfolio-updated'` after transaction changes

## 🚀 Getting Started

### 1. Install

```bash
git clone <your-repo>
cd portfolio-tracker
npm install
```

### 2. Supabase

Create a project and apply the schema (tables + RLS policies for `transactions`, `goals`, `profiles`, `user_ai_insights`, etc.).

### 3. Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Optional but recommended
FINNHUB_API_KEY=...

# Optional — entire AI feature disappears when missing
XAI_API_KEY=...
```

### 4. Run

```bash
npm run dev
```

Sign up, add a few transactions, and explore the dashboard + AI Insights sidebar.

## 📦 Deployment

Deploy to Vercel. Add the same environment variables in the project settings. Preview deployments work out of the box.

## License

MIT

---
