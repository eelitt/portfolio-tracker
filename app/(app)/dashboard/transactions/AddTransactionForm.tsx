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
  // Symbol options are provided by SymbolSelect based on the current asset type.
  // Use initials when provided (e.g. clicking a holding to sell).
  const [assetType, setAssetType] = useState<AssetType>(initialAssetType || 'stock')
  const [symbol, setSymbol] = useState(initialSymbol || '')

  // Controlled action so we can default to 'sell' when prefilled from a holding.
  const defaultAction = initialAction || (initialAssetType === 'cash' ? 'inflow' : 'buy')
  const [action, setAction] = useState<'buy' | 'sell' | 'inflow' | 'outflow'>(defaultAction)

  const handleAssetTypeChange = (newType: AssetType) => {
    setAssetType(newType)
    setSymbol('') // reset symbol when the category changes
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
  }, [state])

  return (
    <form action={formAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            name="asset_type"
            value={assetType}
            onChange={(e) => handleAssetTypeChange(e.target.value as AssetType)}
            className="border p-2 rounded"
            required
          >
            <option value="stock">Stock</option>
            <option value="etf">ETF / Index Fund</option>
            <option value="crypto">Crypto</option>
            <option value="cash">Cash / Savings</option>
          </select>

          <SymbolSelect
            assetType={assetType}
            value={symbol}
            onChange={setSymbol}
            className="border p-2 rounded"
            required
          />

          <select
            name="action"
            value={action}
            onChange={(e) => setAction(e.target.value as 'buy' | 'sell' | 'inflow' | 'outflow')}
            className="border-gray-300 focus:border-gray-400 focus:ring-1 focus:ring-gray-200 p-2 rounded transition-colors"
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

          <input name="quantity" type="number" step="any" placeholder="Quantity" className="border p-2 rounded" required />

          {assetType !== 'cash' && (
            <input name="unit_price" type="number" step="any" placeholder="Price per unit" className="border p-2 rounded" required />
          )}

          <input 
            name="executed_at" 
            type="date" 
            className="border p-2 rounded" 
            required 
            defaultValue={new Date().toISOString().split('T')[0]} 
            suppressHydrationWarning 
          />

          {/* Hidden unit_price for cash/savings (always 1). Action is now shown as Inflow/Outflow. */}
          {assetType === 'cash' && (
            <input type="hidden" name="unit_price" value="1" />
          )}
          <input name="notes" placeholder="Notes (optional)" className="border p-2 rounded md:col-span-2" />
         <Button 
            type="submit" 
            disabled={isPending} 
            className="md:col-span-2"
            variant="default"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Transaction'
            )}
          </Button>
        </form>
  )
}