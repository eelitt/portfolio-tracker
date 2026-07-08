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

  // For cash we hide action and unit_price in the UI.
  // We still track them for submission (cash always uses buy + price 1).
  const [editAction, setEditAction] = useState<'buy' | 'sell'>('buy')
  const [editUnitPrice, setEditUnitPrice] = useState<number>(1)

  useEffect(() => {
    if (transaction) {
      setOpen(true)
      setEditAssetType(transaction.asset_type as AssetType)
      setEditSymbol(transaction.symbol)
      setEditAction(transaction.action as 'buy' | 'sell')
      setEditUnitPrice(transaction.unit_price)
    }
  }, [transaction])

  const isEdit = !!transaction
  const title = isEdit ? 'Edit Transaction' : 'Add New Transaction'

  const handleClose = () => {
    setOpen(false)
    onClose?.()
  }

  // Edit form handler (moved from old EditTransactionModal)
  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!transaction) return

    setIsPending(true)
    const formData = new FormData(e.currentTarget)
    const result = await updateTransaction(transaction.id, formData)
    setIsPending(false)

    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to update')
    } else {
      toast.success('Transaction updated')
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      handleClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Only render the trigger (the "Add Transaction" button) for the standalone add case.
          The edit instance (inside TransactionTable) passes the `transaction` prop (null or value)
          and we never want to render a trigger button for it, because that button lives in the
          transaction history area and would receive focus on close, causing the page to scroll down. */}
      {transaction === undefined && (
        <DialogTrigger asChild>
          {trigger || (
            <Button className="flex items-center gap-2 mb-3" variant="default">
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
          // For the edit instance we open programmatically from holdings cards,
          // avoid any scroll-to-focus behavior that could jump the viewport
          // down to the transaction history area on close.
          // Focus will naturally be restored to the card that was clicked.
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
              <select
                name="asset_type"
                value={editAssetType}
                onChange={(e) => {
                  const newType = e.target.value as AssetType
                  setEditAssetType(newType)
                  setEditSymbol('') // reset symbol when type changes
                  if (newType === 'cash') {
                    setEditAction('buy')
                    setEditUnitPrice(1)
                  }
                }}
                className="border p-2 rounded"
                required
              >
                <option value="stock">Stock</option>
                <option value="etf">ETF / Index Fund</option>
                <option value="crypto">Crypto</option>
                <option value="cash">Cash / Savings</option>
              </select>

              <SymbolSelect
                assetType={editAssetType}
                value={editSymbol}
                onChange={setEditSymbol}
                className="border p-2 rounded"
                preserveSymbolForEdit={transaction.symbol}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {editAssetType !== 'cash' ? (
                <select
                  name="action"
                  value={editAction}
                  onChange={(e) => setEditAction(e.target.value as 'buy' | 'sell')}
                  className="border p-2 rounded"
                  required
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              ) : (
                <input type="hidden" name="action" value={editAction} />
              )}
              <input
                name="quantity"
                type="number"
                step="any"
                defaultValue={transaction.quantity}
                className="border p-2 rounded"
                required
              />
            </div>

            {editAssetType !== 'cash' ? (
              <div className="grid grid-cols-2 gap-4">
                <input
                  name="unit_price"
                  type="number"
                  step="any"
                  value={editUnitPrice}
                  onChange={(e) => setEditUnitPrice(parseFloat(e.target.value) || 1)}
                  className="border p-2 rounded"
                  required
                />
              </div>
            ) : (
              <input type="hidden" name="unit_price" value={editUnitPrice} />
            )}

            <div className="grid grid-cols-2 gap-4">
              <input
                name="executed_at"
                type="date"
                defaultValue={transaction.executed_at.split('T')[0]}
                className="border p-2 rounded"
                required
              />
            </div>

            <input
              name="notes"
              defaultValue={transaction.notes || ''}
              placeholder="Notes (optional)"
              className="border p-2 rounded w-full"
            />

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
          // ADD MODE - reuse existing form
          <AddTransactionForm onSuccess={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}