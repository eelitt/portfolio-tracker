'use client'

/**
 * TransactionTable
 *
 * Displays the user's transaction history in a table.
 * Provides edit (opens unified TransactionModal in edit mode) and delete actions.
 * Delete uses a confirmation modal.
 *
 * This is a client component because it needs local state for the edit/delete modals
 * and calls server actions.
 */

import { deleteTransaction } from '@/app/actions/transactions'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'
import TransactionModal from './TransactionModal'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DeleteTransactionModal from './DeleteTransactionModal'
import { Transaction } from '@/lib/types'
import { getAssetTypeLabel } from '@/lib/utils'
import { formatCurrency } from '@/lib/currency'
import type { PreferredCurrency } from '@/app/actions/users'


interface TransactionTableProps {
  transactions: (Transaction & { formattedDate?: string })[]
  preferredCurrency?: PreferredCurrency
  usdToPreferredRate?: number
}

export default function TransactionTable({ 
  transactions, 
  preferredCurrency = 'USD', 
  usdToPreferredRate = 1 
}: TransactionTableProps) {
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleEdit = (tx: Transaction) => {
    setEditingTransaction(tx)
  }

  const closeEditModal = () => {
    setEditingTransaction(null)
  }

  // Listen for edit requests from other parts of the UI (e.g. clicking a holding card)
  useEffect(() => {
    const handleEditTransaction = (e: CustomEvent<Transaction>) => {
      const tx = e.detail
      if (tx) {
        setEditingTransaction(tx)
      }
    }
    window.addEventListener('edit-transaction', handleEditTransaction as EventListener)
    return () => {
      window.removeEventListener('edit-transaction', handleEditTransaction as EventListener)
    }
  }, [])

  const openDeleteModal = (tx: Transaction) => {
    setDeletingTransaction(tx)
  }

  const closeDeleteModal = () => {
    setDeletingTransaction(null)
  }

  // Actual delete logic
  const handleDeleteConfirm = async (id: string) => {
  setIsDeleting(true)

  try {
    const result = await deleteTransaction(id)

    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success('Transaction deleted successfully')
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      closeDeleteModal()
    }
  } catch (error) {
    toast.error('Something went wrong while deleting')
  } finally {
    setIsDeleting(false)
  }
}

  if (transactions.length === 0) {
    return <p className="text-gray-500">No transactions yet.</p>
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-background divide-y divide-border">
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-muted/50">
              <td className="px-4 py-3 text-sm text-gray-600">
                {tx.formattedDate ?? new Date(tx.executed_at).toLocaleDateString('fi-FI', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </td>
              <td className="px-4 py-3 font-medium">{tx.symbol}</td>
              <td className="px-4 py-3 text-sm">{getAssetTypeLabel(tx.asset_type)}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  tx.action === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {tx.action.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono">{tx.quantity}</td>
              <td className="px-4 py-3 text-right font-mono">
                {formatCurrency(
                  tx.unit_price, 
                  preferredCurrency, 
                  tx.asset_type === 'cash' ? 1 : usdToPreferredRate
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[200px]">
                {tx.notes || '-'}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(tx)}
                    className="h-8 w-8 text-blue-600 hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                    aria-label="Edit transaction"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openDeleteModal(tx)}
                    className="h-8 w-8 text-red-600 hover:bg-red-600 hover:text-white transition-all active:scale-95"
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Merged Transaction Modal for editing */}
      <TransactionModal 
        transaction={editingTransaction} 
        onClose={closeEditModal} 
      />

      <DeleteTransactionModal
        transaction={deletingTransaction}
        isOpen={!!deletingTransaction}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteConfirm}
        isPending={isDeleting}
        preferredCurrency={preferredCurrency}
        usdToPreferredRate={usdToPreferredRate}
      />
    </div>
  )
}