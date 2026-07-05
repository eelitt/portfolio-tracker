# Portfolio Tracker

A clean, professional investment portfolio tracker built with Next.js. Record buy/sell transactions for stocks and crypto, automatically calculate holdings, cost basis, and P&L, and get **AI-powered portfolio insights** powered by xAI Grok.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-green)
![AI](https://img.shields.io/badge/AI-xAI%20Grok-purple)

## ✨ Highlights

- **Transaction-based tracking** — Holdings, average cost, realized & unrealized P&L are automatically calculated from your buy/sell history.
- **Live market data** — Real-time prices for stocks (Finnhub) and crypto (CoinGecko) with graceful fallback.
- **Rich dashboard** — Portfolio value, 24h change, allocation pie chart, and detailed holdings view.
- **AI Portfolio Insights** — One-click analysis of your portfolio using xAI Grok (optional feature).
- **Privacy-first** — All data is private per user via Supabase Row Level Security. AI only receives an aggregated summary.
- **Exportable** — Download transactions or current holdings as CSV.

## 🤖 AI Portfolio Insights (xAI Grok)

Click **"Get AI Insights"** on the dashboard to receive a concise, professional analysis of your current portfolio.

The AI receives only a summarized snapshot (totals, 24h performance, top holdings, allocation, and P&L) — never your full transaction history. A clear disclaimer is always shown.

The entire feature is **optional** and completely hidden when no `XAI_API_KEY` is configured.

## 🛠 Tech Stack

- **Next.js 16** (App Router + Server Actions)
- **Supabase** (Authentication + Postgres with Row Level Security)
- **Vercel AI SDK** + **xAI Grok**
- **Tailwind CSS** + **shadcn/ui**
- **Recharts** (allocation pie chart)
- **Zod** (validation)
- **Sonner** (toast notifications)

## 🚀 Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/portfolio-tracker
cd portfolio-tracker
npm install
```

### 2. Supabase Setup

1. Create a new Supabase project.
2. Run the required SQL (tables + RLS policies).
3. Copy your project URL and anon key.

### 3. Environment Variables

Create `.env.local`:

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Price APIs (optional but recommended)
FINNHUB_API_KEY=your-finnhub-key

# AI Insights (optional — hides the button when missing)
XAI_API_KEY=your-xai-key
```

### 4. Run the App

```bash
npm run dev
```

Open http://localhost:3000 and create an account.

## 🤖 About the AI Feature

The AI insights are designed to be:
- **On-demand** — only generated when you click the button
- **Lightweight** — sends a compact summary, not raw transactions
- **Responsible** — always accompanied by a clear disclaimer
- **Optional** — the entire feature disappears cleanly when not configured

This makes it safe and practical even for users who don't want AI involvement.

## 📦 Deployment

Deploy easily on Vercel. Make sure to add the same environment variables (especially the Supabase and optional XAI keys).

## License

MIT

