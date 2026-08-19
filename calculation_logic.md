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

---

## Goal / DCA projection

**Inputs:** assigned PV (or full book MV if `assigned_amount` is null), target amount, optional target date, planned monthly contribution, nominal annual `r`.

**Monthly rate:** `i = r / 12`. Contribution at month-end (ordinary annuity).

**Projected value:** `FV = PV (1+i)^n + PMT ((1+i)^n − 1) / i`. If `i = 0`, `FV = PV + PMT × n`. `n = 0` → `PV`.

**Required monthly:** invert for `PMT` so `FV = target`. If `PV ≥ target` or growth of `PV` alone reaches target → `0`. If `n = 0` and still short → remaining lump `target − PV`.

**Months to target:** invert for `n` (ceil). `null` = never (no contribution and non-positive `i`, or the annuity never reaches).

**Status:** `incomplete` if date or planned monthly is missing; else `ahead` / `on_track` / `behind` from planned vs required (not a probability).

**`r`:** `Σ (MV_i / total MV) × rate_i` on current priced holdings + cash, not the saved allocation policy. Rates: stock/etf **8%**, cash **0%**, stables **0%**, each other crypto = that coin’s Yahoo `{TICKER}-USD` CAGR − **2pp** (floor 0%, no cap) if the series is **≥ 5 years**; otherwise BTC’s planning rate (or **6%** if BTC is missing). Empty book → cash rate (0%). Sensitivity: same engine at `r − 2pp`. Two labeled paths: growth-only (`PMT = 0`) vs planned `PMT`. Required monthly is the minimum to hit the date, not the path used for the planned projection.

**Actual monthly deposits:** last 90 days of asset `buy` notionals plus user cash `inflow` (not `Proceeds from SELL…`), preferred FX, ÷ 3. Per-goal `include_cash = false` drops cash from starting MV, from `r` slices, and from that deposit total (buys only). Assigned amount still overrides starting MV.

**BTC CAGR:** `(last/first)^(1/years) − 1` on Yahoo `BTC-USD` first→last close. `years` = day span / 365.25. Stored globally; not the user’s TWR.

**Caveat:** nominal, not real. 2014–now is not Bitcoin’s 2009 lifetime. Not a forecast.

**Code:** `lib/projections/`
