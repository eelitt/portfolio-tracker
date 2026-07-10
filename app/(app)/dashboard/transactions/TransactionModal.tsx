'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import AddTransactionForm from './AddTransactionForm'
import SymbolSelect from './SymbolSelect'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Loader2 } from 'lucide-react'
import { updateTransaction } from '@/app/actions/transactions'
import { toast } from 'sonner'
import { Transaction } from '@/lib/types'
import type { AssetType } from '@/lib/types'

interface TransactionModalProps {
  transaction?: Transaction | null
  trigger?: React.ReactNode
  onClose?: () => void
}

export default function TransactionModal({
  transaction,
  trigger,
  onClose,
}: TransactionModalProps) {
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  // Controlled state for the dependent asset + symbol fields in edit mode.
  const [editAssetType, setEditAssetType] = useState<AssetType>('stock')
  const [editSymbol, setEditSymbol] = useState('')

  // For cash we still track action (Inflow/Outflow) and unit_price=1.
  const [editAction, setEditAction] = useState<'buy' | 'sell' | 'inflow' | 'outflow'>('buy')
  const [editUnitPrice, setEditUnitPrice] = useState<number>(1)

  // Prefill state used only by the add instance (when no transaction prop).
  // Allows holdings cards to open the add form already filled for that symbol (default sell).
  type AddPrefill = { assetType?: AssetType; symbol?: string; action?: 'buy' | 'sell' | 'inflow' | 'outflow' }
  const [addPrefill, setAddPrefill] = useState<AddPrefill | null>(null)

  // Key to force remount of AddTransactionForm on every new add open (normal or prefilled).
  // This ensures initial* props are used fresh for state in the form.
  const [addFormKey, setAddFormKey] = useState(0)

  useEffect(() => {
    if (transaction) {
      setOpen(true)
      setEditAssetType(transaction.asset_type as AssetType)
      setEditSymbol(transaction.symbol)
      setEditAction(transaction.action as 'buy' | 'sell' | 'inflow' | 'outflow')
      setEditUnitPrice(transaction.unit_price)
    }
  }, [transaction])

  // Listen for prefill requests from holdings cards (or other parts of UI).
  // Only the add instance (no transaction prop) should respond.
  useEffect(() => {
    if (transaction !== undefined) return

    const handleAddForHolding = (e: CustomEvent<{ asset_type?: AssetType; symbol?: string }>) => {
      const d = e.detail || {}
      if (!d.symbol) return
      const isCash = d.asset_type === 'cash'
      setAddPrefill({
        assetType: d.asset_type,
        symbol: d.symbol,
        action: isCash ? 'inflow' : 'sell',
      })
      setAddFormKey(k => k + 1)
      setOpen(true)
    }

    window.addEventListener('add-transaction', handleAddForHolding as EventListener)
    return () => window.removeEventListener('add-transaction', handleAddForHolding as EventListener)
  }, [transaction])

  const isEdit = !!transaction
  const title = isEdit
    ? 'Edit Transaction'
    : addPrefill?.symbol
      ? `Add Transaction for ${addPrefill.symbol}`
      : 'Add New Transaction'

  const handleClose = () => {
    setOpen(false)
    setAddPrefill(null)
    onClose?.()
  }

  // Edit form handler (moved from old EditTransactionModal)
  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!transaction) return

    setIsPending(true)
    const formData = new FormData(e.currentTarget)
    const result = await updateTransaction(transaction.id!, formData)
    setIsPending(false)

    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to update')
    } else {
      toast.success('Transaction updated')
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      handleClose()
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      // Clear any prefill when the dialog closes (via X, outside click, cancel, etc.)
      setAddPrefill(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Only render the trigger (the "Add Transaction" button) for the standalone add case.
          The edit instance (inside TransactionTable) passes the `transaction` prop (null or value)
          and we never want to render a trigger button for it, because that button lives in the
          transaction history area and would receive focus on close, causing the page to scroll down. */}
      {transaction === undefined && (
        <DialogTrigger asChild>
          {trigger || (
            <Button
              onClick={() => {
                // Ensure we are doing a fresh normal add, not carrying over a holding prefill.
                setAddPrefill(null)
                setAddFormKey(k => k + 1)
              }}
              className="flex items-center gap-2 mb-3"
              variant="default"
            >
              <Plus className="h-4 w-4" />
              Add Transaction
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent
        className="sm:max-w-[520px] shadow-xl rounded-xl p-6 border ring-0"
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          // For the edit instance (opened from Transaction History table),
          // avoid scroll/focus side-effects.
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
        </DialogHeader>

        {isEdit ? (
          // EDIT MODE
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="edit-asset-type" className="text-sm font-medium">Asset Type</label>
                <select
                  id="edit-asset-type"
                  name="asset_type"
                  value={editAssetType}
                  onChange={(e) => {
                    const newType = e.target.value as AssetType
                    setEditAssetType(newType)
                    setEditSymbol('') // reset symbol when type changes
                    if (newType === 'cash') {
                      setEditAction('inflow')
                      setEditUnitPrice(1)
                    }
                  }}
                  className="border p-2 rounded w-full"
                  required
                >
                  <option value="stock">Stock</option>
                  <option value="etf">ETF / Index Fund</option>
                  <option value="crypto">Crypto</option>
                  <option value="cash">Cash / Savings</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="edit-symbol" className="text-sm font-medium">Symbol</label>
                <SymbolSelect
                  assetType={editAssetType}
                  value={editSymbol}
                  onChange={setEditSymbol}
                  className="border p-2 rounded w-full"
                  preserveSymbolForEdit={transaction.symbol}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="edit-action" className="text-sm font-medium">Action</label>
                <select
                  id="edit-action"
                  name="action"
                  value={editAssetType === 'cash' 
                    ? (editAction === 'buy' || editAction === 'inflow' ? 'inflow' : 'outflow')
                    : editAction}
                  onChange={(e) => setEditAction(e.target.value as 'buy' | 'sell' | 'inflow' | 'outflow')}
                  className="border p-2 rounded w-full"
                  required
                >
                  {editAssetType === 'cash' ? (
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
              <div className="space-y-1">
                <label htmlFor="edit-quantity" className="text-sm font-medium">Quantity</label>
                <input
                  id="edit-quantity"
                  name="quantity"
                  type="number"
                  step="any"
                  defaultValue={transaction.quantity}
                  className="border p-2 rounded w-full"
                  required
                />
              </div>
            </div>

            {editAssetType !== 'cash' ? (
              <div className="space-y-1">
                <label htmlFor="edit-unit-price" className="text-sm font-medium">Unit Price</label>
                <input
                  id="edit-unit-price"
                  name="unit_price"
                  type="number"
                  step="any"
                  value={editUnitPrice}
                  onChange={(e) => setEditUnitPrice(parseFloat(e.target.value) || 1)}
                  className="border p-2 rounded w-full"
                  required
                />
              </div>
            ) : (
              <input type="hidden" name="unit_price" value={editUnitPrice} />
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="edit-executed-at" className="text-sm font-medium">Executed At</label>
                <input
                  id="edit-executed-at"
                  name="executed_at"
                  type="date"
                  defaultValue={transaction.executed_at.split('T')[0]}
                  className="border p-2 rounded w-full"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="edit-notes" className="text-sm font-medium">Notes</label>
              <input
                id="edit-notes"
                name="notes"
                defaultValue={transaction.notes || ''}
                placeholder="Notes (optional)"
                className="border p-2 rounded w-full"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1 hover:bg-red-800"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                variant="default"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </form>
        ) : (
          // ADD MODE - reuse existing form (may be prefilled when coming from a holding card)
          <AddTransactionForm
            key={addFormKey}
            onSuccess={handleClose}
            initialAssetType={addPrefill?.assetType}
            initialSymbol={addPrefill?.symbol}
            initialAction={addPrefill?.action}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}