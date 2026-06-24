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
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Loader2 } from 'lucide-react'
import { updateTransaction } from '@/app/actions/transactions'
import { toast } from 'sonner'
import { Transaction } from '@/lib/types'

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
useEffect(() => {
  if (transaction) {
    setOpen(true)
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
      handleClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="flex items-center gap-2 mb-3" variant="default">
            <Plus className="h-4 w-4" />
            Add Transaction
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        className="sm:max-w-[520px] shadow-xl rounded-xl p-6 border ring-0"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
        </DialogHeader>

        {isEdit ? (
          // EDIT MODE
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input
                name="symbol"
                defaultValue={transaction.symbol}
                className="border p-2 rounded"
                required
              />
              <select
                name="asset_type"
                defaultValue={transaction.asset_type}
                className="border p-2 rounded"
                required
              >
                <option value="stock">Stock</option>
                <option value="crypto">Crypto</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <select
                name="action"
                defaultValue={transaction.action}
                className="border p-2 rounded"
                required
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
              <input
                name="quantity"
                type="number"
                step="any"
                defaultValue={transaction.quantity}
                className="border p-2 rounded"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                name="unit_price"
                type="number"
                step="any"
                defaultValue={transaction.unit_price}
                className="border p-2 rounded"
                required
              />
            </div>

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