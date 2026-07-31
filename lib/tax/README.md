# Finnish tax estimator (`lib/tax`)

Pure, EUR-normalized capital-gains estimation for Finnish personal taxation (luovutusvoitto, hankintameno-olettama, progressive pääomatulo rates).

**Not tax advice.** Rates are constants — verify annually.

## Pipeline

```
[Source adapter] → TaxableEvent[] (EUR) → lots (FIFO | weighted avg)
                                      → HMO vs actual per disposal
                                      → progressive tax + notes
```

- **Tax engine** (`lots.ts`, `estimateCapitalGains.ts`, `progressiveTax.ts`) knows only `TaxableEvent`.
- **Adapters** map product or external data into events.

### v1 adapter

- `adapters/appTransactions.ts` — app `Transaction` buy/sell → acquisition/disposal (skips cash).

### Future: wallet / chain (not implemented here)

1. Connect wallet / address  
2. Fetch raw chain activity  
3. **Parse** into `TaxableEvent[]` (swaps = disposal + acquisition legs, transfers, etc.)  
4. Optional merge/dedupe with app events  
5. Call the same `estimateFinnishCapitalGains`  

Use `source: { kind: 'blockchain', chainId, txHash, logIndex? }` and stable `assetKey` strings (e.g. CAIP-19 later). No engine rewrite required if events are complete and EUR-normalized.

## Modes

| Mode | Meaning |
|------|---------|
| `hypothetical_sell` | Cost from full history; only the synthetic disposal is taxed in the result |
| `ytd` | Real disposals in `taxYear` only |
| `full` | YTD real disposals + optional hypothetical + year-end heuristic notes |

## Dual methods

- **FIFO** — closer to common crypto practice for actual cost  
- **Weighted average** — aligns with portfolio tracker P&L  

Each method compares actual cost to **hankintameno-olettama** (20% / 40% by holding period). Losses use actual cost only (HMO is not used to invent a gain).
