'use client'

/**
 * TransactionTable
 *
 * Coordinator component for the transaction history table.
 * Delegates filtering, sorting, pagination, and row rendering to hooks and subcomponents.
 * Owns only modal state and the delete side-effect (server action + toast + events).
 */

import { deleteTransaction } from '@/app/actions/transactions'
import { toast } from 'sonner'
import { useState, useEffect, useMemo } from 'react'
import { useTransactionFilters } from './useTransactionFilters'
import { useTransactionSorting } from './useTransactionSorting'
import { usePagination } from './usePagination'
import TransactionModal from './TransactionModal'
import DeleteTransactionModal from './DeleteTransactionModal'
import { Transaction } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import {
  applyFilters,
  applySort,
  getInflowOutflowCounts,
  type AugmentedTransaction,
} from './transactionUtils'
import TransactionFilters from './TransactionFilters'
import TransactionRow from './TransactionRow'


interface TransactionTableProps {
  transactions: (Transaction & { formattedDate?: string })[]
  preferredCurrency?: PreferredCurrency
  usdToPreferredRate?: number
  usdToEurRate?: number
}

export default function TransactionTable({ 
  transactions, 
  preferredCurrency = 'USD', 
  usdToPreferredRate = 1,
  usdToEurRate = 0.92
}: TransactionTableProps) {
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const pageSize = 25

  // Filters + sorting via dedicated hooks
  const {
    searchTerm,
    setSearchTerm,
    assetFilter,
    setAssetFilter,
    actionFilter,
    setActionFilter,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    clearFilters,
    hasActiveFilters,
  } = useTransactionFilters()

  const { sortColumn, sortDirection, handleSort } = useTransactionSorting({
    defaultColumn: 'date',
  })

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

  // Derived filtered + sorted + paginated list (client-side)
  const filteredAndSorted = useMemo(() => {
    const filtered = applyFilters(transactions as AugmentedTransaction[], {
      searchTerm,
      assetFilter,
      actionFilter,
      dateFrom,
      dateTo,
    })
    return applySort(filtered, { sortColumn, sortDirection })
  }, [transactions, searchTerm, assetFilter, actionFilter, dateFrom, dateTo, sortColumn, sortDirection])

  const totalFiltered = filteredAndSorted.length
  const totalOriginal = transactions.length
  const inflowOutflowCounts = getInflowOutflowCounts(filteredAndSorted)

  // Pagination via dedicated hook
  const {
    currentPage,
    setCurrentPage,
    paginatedItems: paginatedTransactions,
    totalPages,
  } = usePagination(filteredAndSorted, pageSize)

  // Reset to page 1 when filters or sort change (important for good UX)
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, assetFilter, actionFilter, dateFrom, dateTo, sortColumn, sortDirection, setCurrentPage])

  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <p className="font-display text-lg font-medium text-foreground">
          No transactions yet
        </p>
        <p>Add a transaction to start building your history.</p>
      </div>
    )
  }

  // Local wrapper so clearing filters also resets to page 1
  const handleClearFilters = () => {
    clearFilters()
    setCurrentPage(1)
  }

  return (
    <div>
      <TransactionFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        assetFilter={assetFilter}
        onAssetFilterChange={setAssetFilter}
        actionFilter={actionFilter}
        onActionFilterChange={setActionFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onClear={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
        showingCount={paginatedTransactions.length}
        totalFiltered={totalFiltered}
        totalOriginal={totalOriginal}
        inflowCount={inflowOutflowCounts.inflows}
        outflowCount={inflowOutflowCounts.outflows}
      />

      {totalFiltered === 0 && hasActiveFilters && (
        <div className="alert-info mb-4">
          No transactions match your current filters.{' '}
          <button
            onClick={handleClearFilters}
            className="font-medium text-gold underline-offset-4 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-elevated shadow-sm">
        <table className="min-w-full divide-y divide-subtle">
          <thead className="bg-muted/50">
            <tr>
              <th
                onClick={() => handleSort('date')}
                className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground hover:text-gold"
              >
                Date {sortColumn === 'date' && (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th
                onClick={() => handleSort('symbol')}
                className="cursor-pointer select-none px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground hover:text-gold"
              >
                Symbol{' '}
                {sortColumn === 'symbol' && (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Action
              </th>
              <th
                onClick={() => handleSort('quantity')}
                className="cursor-pointer select-none px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground hover:text-gold"
              >
                Quantity{' '}
                {sortColumn === 'quantity' &&
                  (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th
                onClick={() => handleSort('price')}
                className="cursor-pointer select-none px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground hover:text-gold"
              >
                Price {sortColumn === 'price' && (sortDirection === 'desc' ? '↓' : '↑')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                Notes
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {paginatedTransactions.map((tx) => (
              <TransactionRow
                key={tx.id!}
                tx={tx as AugmentedTransaction}
                preferredCurrency={preferredCurrency}
                usdToPreferredRate={usdToPreferredRate}
                usdToEurRate={usdToEurRate}
                onEdit={handleEdit}
                onDelete={openDeleteModal}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div>
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-subtle bg-surface-elevated px-3 py-1.5 text-sm transition-colors hover:border-gold disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
              className="rounded-lg border border-subtle bg-surface-elevated px-3 py-1.5 text-sm transition-colors hover:border-gold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

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
        usdToEurRate={usdToEurRate}
      />
    </div>
  )
}