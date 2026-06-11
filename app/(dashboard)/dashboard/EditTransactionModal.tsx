'use client'

import { useState } from 'react'
import { updateTransaction } from '@/app/actions/transactions'
import { toast } from 'sonner'

interface Transaction {
  id: string
  symbol: string
  asset_type: string
  action: string
  quantity: number
  unit_price: number
  executed_at: string
  notes?: string
}

interface EditTransactionModalProps {
  transaction: Transaction | null
  isOpen: boolean
  onClose: () => void
}

export default function EditTransactionModal({
  transaction,
  isOpen,
  onClose,
}: EditTransactionModalProps) {
  const [isPending, setIsPending] = useState(false)

  if (!isOpen || !transaction) return null

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsPending(true)

    const formData = new FormData(e.currentTarget)
    const result = await updateTransaction(transaction.id, formData)

    setIsPending(false)

    if (result?.error) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to update')
    } else {
      toast.success('Transaction updated')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Edit Transaction</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border py-2 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-black text-white py-2 rounded hover:bg-gray-800 disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}