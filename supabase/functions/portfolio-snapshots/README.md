# `portfolio-snapshots` Edge Function

Daily job: snapshot **active** users’ portfolio market value + cost basis (USD).

## Prerequisites

1. Run SQL migration: `supabase/migrations/20260718_portfolio_snapshots.sql` in the Supabase SQL Editor.
2. Set secrets (Dashboard → Edge Functions → Secrets, or CLI):
   - `FINNHUB_API_KEY` (required for stocks/ETFs)
   - Optional: `SNAPSHOT_CONCURRENCY` (default `5`)
   - Optional: `ACTIVE_DAYS` (default `90`)
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically

## Deploy

```bash
supabase functions deploy portfolio-snapshots
```

## Auth

Requires `SUPABASE_SERVICE_ROLE_KEY` in the function environment (default on Supabase).
No request-header comparison. Use the Dashboard invoke or Supabase sample curl.

## Manual run

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/portfolio-snapshots" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Schedule

Dashboard → Edge Functions → Schedules → `0 22 * * *` (22:00 UTC),  
or uncomment `pg_cron` in the migration SQL.

## Verify

```sql
SELECT user_id, snapshot_date, total_market_value, total_cost_basis,
       is_partial, priced_asset_count, holdings_count
FROM public.portfolio_snapshots
ORDER BY snapshot_date DESC
LIMIT 50;
```

## Keep in sync

| Edge | App |
|------|-----|
| `CRYPTO_IDS` | `lib/symbols/cryptos.json` |
| `calculateHoldings` | `lib/calculatePortfolio.ts` |
