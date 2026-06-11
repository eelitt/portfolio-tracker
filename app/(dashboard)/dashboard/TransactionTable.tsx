'use client'

import { deleteTransaction } from '@/app/actions/transactions'
import { toast } from 'sonner'
import { useState } from 'react'
import EditTransactionModal from './EditTransactionModal'

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

interface TransactionTableProps {
  transactions: Transaction[]
}

export default function TransactionTable({ transactions }: TransactionTableProps) {

const [editingTransaction, setEditingTransaction] = useState<any>(null)
const [isModalOpen, setIsModalOpen] = useState(false)

const handleEdit = (tx: any) => {
  setEditingTransaction(tx)
  setIsModalOpen(true)
}

const closeModal = () => {
  setIsModalOpen(false)
  setEditingTransaction(null)
}
  const handleDelete = async (id: string, symbol: string) => {
    if (!confirm(`Delete transaction for ${symbol}?`)) return

    const result = await deleteTransaction(id)

    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success('Transaction deleted')
    }
  }

  if (transactions.length === 0) {
    return <p className="text-gray-500">No transactions yet.</p>
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
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
        <tbody className="bg-white divide-y divide-gray-200">
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-600">
                {new Date(tx.executed_at).toLocaleDateString('fi-FI', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})}
              </td>
              <td className="px-4 py-3 font-medium">{tx.symbol}</td>
              <td className="px-4 py-3 text-sm capitalize">{tx.asset_type}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  tx.action === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {tx.action.toUpperCase()}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono">{tx.quantity}</td>
              <td className="px-4 py-3 text-right font-mono">${tx.unit_price}</td>
              <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[200px]">
                {tx.notes || '-'}
              </td>
              <td className="px-4 py-3 text-right space-x-3">
                <button
    onClick={() => handleEdit(tx)}
    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
  >
    Edit
  </button>
                <button
                  onClick={() => handleDelete(tx.id, tx.symbol)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <EditTransactionModal
  transaction={editingTransaction}
  isOpen={isModalOpen}
  onClose={closeModal}
/>
    </div>
  )
}