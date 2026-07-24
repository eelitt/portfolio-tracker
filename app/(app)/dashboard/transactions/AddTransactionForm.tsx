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
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SymbolSelect from './SymbolSelect'
import type { AssetType } from '@/lib/types'
import { fieldClassName, labelClassName } from './formStyles'

const initialState: ActionState = { error: undefined, success: false }
interface AddTransactionFormProps {
  onSuccess?: () => void
  /** When opened from a holding card, prefill the form to record a tx for that position. */
  initialAssetType?: AssetType
  initialSymbol?: string
  /** Suggested starting action (e.g. 'sell' when coming from an open holding). Ignored for cash. */
  initialAction?: 'buy' | 'sell' | 'inflow' | 'outflow'
}

export default function AddTransactionForm({
  onSuccess,
  initialAssetType,
  initialSymbol,
  initialAction,
}: AddTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(createTransaction, initialState)

  // Controlled state for the dependent asset_type + symbol pair.
  const [assetType, setAssetType] = useState<AssetType>(initialAssetType || 'stock')
  const [symbol, setSymbol] = useState(initialSymbol || '')

  const defaultAction =
    initialAction || (initialAssetType === 'cash' ? 'inflow' : 'buy')
  const [action, setAction] = useState<'buy' | 'sell' | 'inflow' | 'outflow'>(
    defaultAction
  )

  const handleAssetTypeChange = (newType: AssetType) => {
    setAssetType(newType)
    setSymbol('')
    if (newType === 'cash') {
      setAction('inflow')
    }
  }

  useEffect(() => {
    if (state.success) {
      toast.success('Transaction added successfully')
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      onSuccess?.()
    }
    if (state.error) {
      const msg = typeof state.error === 'string' ? state.error : 'Validation error'
      toast.error(msg)
    }
  }, [state, onSuccess])

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label htmlFor="add-asset-type" className={labelClassName}>
          Asset type
        </label>
        <select
          id="add-asset-type"
          name="asset_type"
          value={assetType}
          onChange={(e) => handleAssetTypeChange(e.target.value as AssetType)}
          className={fieldClassName}
          required
        >
          <option value="stock">Stock</option>
          <option value="etf">ETF / Index Fund</option>
          <option value="crypto">Crypto</option>
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
          onChange={(e) =>
            setAction(e.target.value as 'buy' | 'sell' | 'inflow' | 'outflow')
          }
          className={fieldClassName}
          required
        >
          {assetType === 'cash' ? (
            <>
              <option value="inflow">Inflow</option>
              <option value="outflow">Outflow</option>
            </>
          ) : (
            <>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </>
          )}
        </select>
      </div>

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

      {assetType !== 'cash' ? (
        <div className="space-y-1.5">
          <label htmlFor="add-unit-price" className={labelClassName}>
            Unit price
          </label>
          <input
            id="add-unit-price"
            name="unit_price"
            type="number"
            step="any"
            placeholder="0.00"
            className={fieldClassName}
            required
          />
        </div>
      ) : (
        <input type="hidden" name="unit_price" value="1" />
      )}

      <div className="space-y-1.5">
        <label htmlFor="add-executed-at" className={labelClassName}>
          Executed at
        </label>
        <input
          id="add-executed-at"
          name="executed_at"
          type="date"
          className={fieldClassName}
          required
          defaultValue={new Date().toISOString().split('T')[0]}
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
        <Button type="submit" disabled={isPending} variant="default" size="sm">
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
