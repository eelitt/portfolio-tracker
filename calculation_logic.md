# Calculation logic

Formula sheet for **tested money math**. Pipeline, isolation, and who may invent numbers: [architecture.md](./architecture.md). Finnish tax detail: [lib/tax/README.md](./lib/tax/README.md).

Change a formula → update this file in the same change. Do not document UI here.

---

## Weighted average holdings

**Inputs:** transactions for one symbol, chronological.  
**Formula:** buy/inflow adds `qty` and `qty × unit_price` to cost. Sell/outflow of `q = min(sold, owned)` uses `avgCost = totalCost / qty`; realized P&L `+= q × unit_price − q × avgCost`; remaining cost `− q × avgCost`. Oversells are capped. Closed positions drop.  
**Caveat:** operating book only — not FIFO, not taxable gain. Currency stamped from the first chronological row per symbol.  
**Code:** `calculateHoldings` in `lib/calculatePortfolio.ts`

---

## Missing live quote

**Inputs:** holding + quote.  
**Formula:** if price missing or `≤ 0`, `priceAvailable = false`; market value / 24h / unrealized P&L treated as 0 for **marks**, not as a total loss. Cost still counts. Aggregates: MV and 24h = priced assets + cash; uPnL = priced assets only.  
**Caveat:** do not treat an unpriced name as marked at $0.  
**Code:** `enrichHoldings`, `aggregatePreferredPortfolio`

---

## FX to preferred currency

**Inputs:** USD live marks; cost / realized in entry currency; USD→EUR rate.  
**Formula:** convert each side, then recompute unrealized P&L. Never scale a mixed-unit P&L by the FX rate.  
**Cash:** convert **each** cash tx (`qty × unit_price`) then net. Do not sum mixed EUR+USD faces.  
**Code:** `toPreferredHolding`, `calculateCashHoldingsInPreferred` in `lib/convertToPreferred.ts`

---

## Allocation drift

**Inputs:** priced holdings + cash, saved type weights (sum 100%), optional symbol % of total MV.  
**Formula:** `deltaPp = actual% − target%`. Status vs tolerance band.  
**Caveat:** unpriced names excluded from weights and notionals.  
**Code:** `computeDrift` in `lib/allocationTargets/drift.ts`

---

## Benchmarks (price path)

**Inputs:** portfolio snapshot series, bench daily closes, aligned on **intersection dates** (no fill-forward).  
**Window %:** `(last − first) / first` on the aligned pair.  
**Tracking error:** sample stdev of daily excess returns (percentage points). Annualize `× √365` only if overlap ≥ 30 days.  
**Contribution:** holding `ΔMV / portfolio ΔMV` over the chart window. Omit names with no series. Cash in/out is part of ΔMV.  
**Caveat:** bench is price; book snapshots are market value. TE still uses daily MV vs price.  
**Code:** `lib/benchmarks/` (`excessReturn` is MV window %; UI headline excess is TWR − bench — see below)

---

## Daily-linked TWR

**Inputs:** daily portfolio snapshots (preferred currency); cash `inflow` / `outflow` only (same FX as cash holdings).  
**External CF on snapshot day `t`:** sum of those flows with `prevDate < date ≤ t`. Buys/sells are internal (`CF = 0`).  
**Daily step:** `r_t = (MV_t − MV_{t−1} − CF_t) / MV_{t−1}` if `MV_{t−1} > 0`.  
**Window TWR:** `∏ (1 + r_t) − 1`.  
**Vol:** sample stdev of `r_t`; annualize `× √365` if `n ≥ 30`.  
**Max drawdown:** peak-to-trough on the wealth index `I_0 = 1`, `I_t = I_{t−1} (1 + r_t)`. Reported ≤ 0.  
**Headline excess:** `TWR − bench window %` (bench still price first→last).  
**Caveat:** end-of-day snapshots; not NAV-perfect. A buy without a prior inflow inflates TWR (ledger issue). Not alpha.  
**Code:** `lib/performance/` (`dailyTwrs`, `linkedReturn`, `returnVolatility`, `maxDrawdownFromReturns`)
