'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { estimateFinnishTax } from '@/app/actions/tax/estimateTax'
import { getHoldingsForExport } from '@/app/actions/transactions'
import type { FinnishTaxEstimateResult, EstimateMode } from '@/lib/tax'
import type { EnrichedHolding } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import { fieldClassName, labelClassName } from '../dashboard/transactions/formStyles'
import TaxEstimateResult from './TaxEstimateResult'

interface TaxEstimatorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preferredCurrency?: PreferredCurrency
}

const MODES: { id: EstimateMode; label: string; description: string }[] = [
  {
    id: 'hypothetical_sell',
    label: 'What-if sell',
    description:
      'Estimates tax for a sale you have not recorded yet (symbol, quantity, price below). Uses your buy history only to compute cost basis. Past sell transactions are not included in the tax total.',
  },
  {
    id: 'ytd',
    label: 'Year-to-date',
    description:
      'Estimates tax from sell transactions you already logged in the selected tax year. If you have no sells that year, the result will be empty / zero. Earlier buys still count for cost basis.',
  },
  {
    id: 'full',
    label: 'Combined',
    description:
      'Year-to-date sells already logged in the selected tax year, plus an optional what-if sell if you pick a symbol. Leave symbol empty to use only past sells. Includes short year-end notes (not advice).',
  },
]

export default function TaxEstimatorModal({
  open,
  onOpenChange,
  preferredCurrency = 'USD',
}: TaxEstimatorModalProps) {
  const currentYear = new Date().getUTCFullYear()
  const [mode, setMode] = useState<EstimateMode>('hypothetical_sell')
  const [taxYear, setTaxYear] = useState(currentYear)
  const [symbol, setSymbol] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [otherCapitalIncomeEur, setOtherCapitalIncomeEur] = useState('0')
  const [sellingCostsEur, setSellingCostsEur] = useState('0')
  const [holdings, setHoldings] = useState<EnrichedHolding[]>([])
  const [loadingHoldings, setLoadingHoldings] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<FinnishTaxEstimateResult | null>(null)

  const assetHoldings = useMemo(
    () =>
      (holdings || []).filter(
        (h) => h.asset_type !== 'cash' && h.quantity > 0
      ) as EnrichedHolding[],
    [holdings]
  )

  useEffect(() => {
    if (!open) {
      setResult(null)
      setPending(false)
      return
    }
    let cancelled = false
    setLoadingHoldings(true)
    getHoldingsForExport()
      .then((rows) => {
        if (!cancelled) setHoldings((rows || []) as EnrichedHolding[])
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load holdings')
      })
      .finally(() => {
        if (!cancelled) setLoadingHoldings(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Prefill price/qty when symbol changes
  useEffect(() => {
    if (!symbol) return
    const h = assetHoldings.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase())
    if (!h) return
    setQuantity(String(h.quantity))
    if (h.priceAvailable && h.currentPrice > 0) {
      setUnitPrice(String(h.currentPrice))
    }
  }, [symbol, assetHoldings])

  const handleClose = (next: boolean) => {
    if (pending && !next) return
    onOpenChange(next)
  }

  const needsWhatIf = mode === 'hypothetical_sell' || mode === 'full'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return

    const other = Number(otherCapitalIncomeEur)
    const costs = Number(sellingCostsEur)
    if (!(other >= 0) || Number.isNaN(other)) {
      toast.error('Other capital income must be a non-negative number (EUR)')
      return
    }
    if (!(costs >= 0) || Number.isNaN(costs)) {
      toast.error('Selling costs must be a non-negative number (EUR)')
      return
    }

    const includeWhatIf =
      mode === 'hypothetical_sell' || (mode === 'full' && Boolean(symbol))

    let qty: number | undefined
    let price: number | undefined
    if (includeWhatIf) {
      if (!symbol) {
        toast.error('Select a symbol')
        return
      }
      qty = Number(quantity)
      price = Number(unitPrice)
      if (!(qty > 0) || Number.isNaN(qty)) {
        toast.error('Quantity must be greater than 0')
        return
      }
      if (!(price >= 0) || Number.isNaN(price)) {
        toast.error('Unit price is required')
        return
      }
    }

    setPending(true)
    setResult(null)
    try {
      const res = await estimateFinnishTax({
        mode,
        taxYear,
        otherCapitalIncomeEur: other,
        sellingCostsEur: includeWhatIf ? costs : 0,
        ...(includeWhatIf && symbol && qty !== undefined && price !== undefined
          ? {
              symbol,
              quantity: qty,
              unitPrice: price,
              unitPriceCurrency: preferredCurrency,
            }
          : {}),
      })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setResult(res.data)
    } catch {
      toast.error('Tax estimate failed. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="panel-scroll sm:max-w-[640px] max-h-[90vh] overflow-y-auto shadow-xl rounded-xl border ring-0">
        <DialogHeader>
          <DialogTitle>Finnish tax estimator</DialogTitle>
          <DialogDescription>
            Capital-gains estimate (luovutusvoitto) in EUR from your portfolio data. Shows FIFO and
            weighted average, each compared to hankintameno-olettama. Estimate only — not tax advice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Mode</p>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <Button
                  key={m.id}
                  type="button"
                  size="sm"
                  variant={mode === m.id ? 'default' : 'outline'}
                  onClick={() => {
                    setMode(m.id)
                    setResult(null)
                  }}
                >
                  {m.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed rounded-lg border bg-muted/30 px-3 py-2">
              {MODES.find((m) => m.id === mode)?.description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClassName} htmlFor="tax-year">
                Tax year
              </label>
              <input
                id="tax-year"
                type="number"
                className={fieldClassName}
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                min={2000}
                max={2100}
              />
            </div>
            <div>
              <label className={labelClassName} htmlFor="other-cap">
                Other capital income (€)
              </label>
              <input
                id="other-cap"
                type="number"
                step="any"
                min={0}
                className={fieldClassName}
                value={otherCapitalIncomeEur}
                onChange={(e) => setOtherCapitalIncomeEur(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional. Affects 30% / 34% band. Default 0.
              </p>
            </div>
          </div>

          {needsWhatIf && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {mode === 'full' ? 'Optional what-if sell' : 'Hypothetical sale'}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {mode === 'full'
                    ? 'Add a planned sale on top of this year’s recorded sells. Leave symbol empty to estimate only from sells you already logged.'
                    : 'This sale is not written to your portfolio. Only this line is taxed in What-if mode.'}
                </p>
              </div>
              <div>
                <label className={labelClassName} htmlFor="tax-symbol">
                  Symbol
                </label>
                <select
                  id="tax-symbol"
                  className={fieldClassName}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  disabled={loadingHoldings}
                >
                  <option value="">
                    {loadingHoldings ? 'Loading holdings…' : 'Select holding…'}
                  </option>
                  {assetHoldings.map((h) => (
                    <option key={h.symbol} value={h.symbol}>
                      {h.symbol} ({h.quantity}
                      {h.priceAvailable ? ` · ${preferredCurrency} ${h.currentPrice}` : ''})
                    </option>
                  ))}
                </select>
                {!loadingHoldings && assetHoldings.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No open non-cash holdings. You can still run Year-to-date if you have past sells.
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClassName} htmlFor="tax-qty">
                    Quantity
                  </label>
                  <input
                    id="tax-qty"
                    type="number"
                    step="any"
                    min={0}
                    className={fieldClassName}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="tax-price">
                    Unit price ({preferredCurrency})
                  </label>
                  <input
                    id="tax-price"
                    type="number"
                    step="any"
                    min={0}
                    className={fieldClassName}
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={labelClassName} htmlFor="tax-costs">
                  Selling costs (€)
                </label>
                <input
                  id="tax-costs"
                  type="number"
                  step="any"
                  min={0}
                  className={fieldClassName}
                  value={sellingCostsEur}
                  onChange={(e) => setSellingCostsEur(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={pending}>
              Close
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Estimate
            </Button>
          </DialogFooter>
        </form>

        {result && (
          <div className="mt-2 border-t pt-4">
            <TaxEstimateResult result={result} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
