'use client'

/**
 * AddTransactionForm
 *
 * Form for creating new buy/sell transactions.
 * Uses React 19 useActionState + Server Action.
 * Shows toasts on success/error and calls onSuccess callback (used to close the modal).
 */

import { useActionState } from 'react'
import { createTransaction, type ActionState } from '@/app/actions/transactions'
import { toast } from 'sonner'
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SymbolSelect from './SymbolSelect'
import FutureOrderFields, { fromLocalInput, toLocalInput } from './FutureOrderFields'
import type { LedgerAssetType, PositionSide, TransactionAction } from '@/lib/types'
import { fieldClassName, labelClassName } from './formStyles'
import type { PreferredCurrency } from '@/lib/userTypes'
import { getCurrencySymbol } from '@/lib/currency'

const initialState: ActionState = { error: undefined, success: false }
interface AddTransactionFormProps {
  onSuccess?: () => void
  /** When opened from a holding card, prefill the form to record a tx for that position. */
  initialAssetType?: LedgerAssetType
  initialSymbol?: string
  /** Suggested starting action (e.g. 'sell' when coming from an open holding). Ignored for cash. */
  initialAction?: TransactionAction
  /** Side filled in when a perp card opens this form. */
  initialSide?: PositionSide
  /** Currency this price will be stored in. */
  preferredCurrency?: PreferredCurrency
}

export default function AddTransactionForm({
  onSuccess,
  initialAssetType,
  initialSymbol,
  initialAction,
  initialSide,
  preferredCurrency = 'USD',
}: AddTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(createTransaction, initialState)

  // Controlled state for the dependent asset_type + symbol pair.
  const [assetType, setAssetType] = useState<LedgerAssetType>(initialAssetType || 'stock')
  const [symbol, setSymbol] = useState(initialSymbol || '')

  const defaultAction =
    initialAction || (initialAssetType === 'cash' ? 'inflow' : 'buy')
  const [action, setAction] = useState<TransactionAction>(defaultAction)
  const [executedAt, setExecutedAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [fillBlocked, setFillBlocked] = useState(false)
  const onBlockedChange = useCallback((blocked: boolean) => {
    setFillBlocked((prev) => (prev === blocked ? prev : blocked))
  }, [])

  const handleAssetTypeChange = (newType: LedgerAssetType) => {
    const prev = assetType
    setAssetType(newType)
    const keepSymbol =
      (prev === 'crypto' && newType === 'future') ||
      (prev === 'future' && newType === 'crypto')
    if (!keepSymbol) setSymbol('')
    if (newType === 'cash') {
      setAction('inflow')
    } else if (
      newType === 'future' &&
      (action === 'inflow' || action === 'outflow')
    ) {
      setAction('buy')
    } else if (
      newType !== 'future' &&
      action !== 'buy' &&
      action !== 'sell' &&
      action !== 'inflow' &&
      action !== 'outflow'
    ) {
      setAction('buy')
    }
    if (newType === 'future' && !executedAt.includes('T')) {
      setExecutedAt(toLocalInput(new Date().toISOString(), true))
    }
    if (newType !== 'future' && executedAt.includes('T')) {
      setExecutedAt(executedAt.slice(0, 10))
    }
  }

  useEffect(() => {
    if (state.success) {
      toast.success('Transaction added successfully')
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      onSuccess?.()
    }
    if (state.error) {
      const msg =
        typeof state.error === 'string'
          ? state.error
          : Object.values(state.error).flat().join(', ') || 'Validation error'
      toast.error(msg)
    }
  }, [state, onSuccess])

  const submitForm = (formData: FormData) => {
    if (assetType === 'future') {
      formData.set('executed_at', fromLocalInput(String(formData.get('executed_at') || '')))
    }
    formAction(formData)
  }

  return (
    <form action={submitForm} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label htmlFor="add-asset-type" className={labelClassName}>
          Asset type
        </label>
        <select
          id="add-asset-type"
          name="asset_type"
          value={assetType}
          onChange={(e) => handleAssetTypeChange(e.target.value as LedgerAssetType)}
          className={fieldClassName}
          required
        >
          <option value="stock">Stock</option>
          <option value="etf">ETF / Index Fund</option>
          <option value="crypto">Crypto</option>
          <option value="future">Future</option>
          <option value="cash">Cash / Savings</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="add-symbol" className={labelClassName}>
          Symbol
        </label>
        <SymbolSelect
          assetType={assetType}
          value={symbol}
          onChange={setSymbol}
          className={fieldClassName}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="add-action" className={labelClassName}>
          Action
        </label>
        <select
          id="add-action"
          name="action"
          value={action}
          onChange={(e) => setAction(e.target.value as TransactionAction)}
          className={fieldClassName}
          required
        >
          {assetType === 'cash' ? (
            <>
              <option value="inflow">Inflow</option>
              <option value="outflow">Outflow</option>
            </>
          ) : assetType === 'future' ? (
            <>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="funding">Funding</option>
              <option value="fee">Fee</option>
              <option value="margin_add">Add margin</option>
              <option value="margin_remove">Remove margin</option>
            </>
          ) : (
            <>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </>
          )}
        </select>
      </div>

      {assetType === 'future' ? (
        <div className="sm:col-span-2">
          <FutureOrderFields
            idPrefix="add"
            symbol={symbol}
            action={action}
            executedAt={executedAt}
            initialSide={initialSide}
            onBlockedChange={onBlockedChange}
          />
        </div>
      ) : (
      <div className="space-y-1.5">
        <label htmlFor="add-quantity" className={labelClassName}>
          Quantity
        </label>
        <input
          id="add-quantity"
          name="quantity"
          type="number"
          step="any"
          placeholder="0"
          className={fieldClassName}
          required
        />
      </div>
      )}

      {assetType === 'cash' ? (
        <input type="hidden" name="unit_price" value="1" />
      ) : assetType !== 'future' ? (
        <div className="space-y-1.5">
          <label htmlFor="add-unit-price" className={labelClassName}>
            Unit price ({getCurrencySymbol(preferredCurrency)})
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {getCurrencySymbol(preferredCurrency)}
            </span>
            <input
              id="add-unit-price"
              name="unit_price"
              type="number"
              step="any"
              placeholder="0.00"
              className={`${fieldClassName} pl-8`}
              required
            />
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="add-executed-at" className={labelClassName}>
          Executed at
        </label>
        <input
          id="add-executed-at"
          name="executed_at"
          type={assetType === 'future' ? 'datetime-local' : 'date'}
          className={fieldClassName}
          required
          value={executedAt}
          onChange={(e) => setExecutedAt(e.target.value)}
          suppressHydrationWarning
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label htmlFor="add-notes" className={labelClassName}>
          Notes
        </label>
        <input
          id="add-notes"
          name="notes"
          placeholder="Optional"
          className={fieldClassName}
        />
      </div>

      <div className="flex justify-end sm:col-span-2">
        <Button
          type="submit"
          disabled={isPending || (assetType === 'future' && fillBlocked)}
          variant="default"
          size="sm"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Adding…
            </>
          ) : (
            'Add transaction'
          )}
        </Button>
      </div>
    </form>
  )
}
