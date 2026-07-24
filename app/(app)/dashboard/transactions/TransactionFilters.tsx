'use client'

import type { Transaction } from '@/lib/types'
import { fieldClassName } from './formStyles'

interface TransactionFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void

  assetFilter: 'all' | Transaction['asset_type']
  onAssetFilterChange: (value: 'all' | Transaction['asset_type']) => void

  actionFilter: 'all' | Transaction['action']
  onActionFilterChange: (value: 'all' | Transaction['action']) => void

  dateFrom: string
  onDateFromChange: (value: string) => void

  dateTo: string
  onDateToChange: (value: string) => void

  onClear: () => void
  hasActiveFilters: boolean

  showingCount: number
  totalFiltered: number
  totalOriginal: number
  inflowCount: number
  outflowCount: number
}

export default function TransactionFilters({
  searchTerm,
  onSearchChange,
  assetFilter,
  onAssetFilterChange,
  actionFilter,
  onActionFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onClear,
  hasActiveFilters,
  showingCount,
  totalFiltered,
  totalOriginal,
  inflowCount,
  outflowCount,
}: TransactionFiltersProps) {
  const controlClass = `${fieldClassName} h-8`

  return (
    <div className="mb-4 rounded-xl border border-subtle bg-surface-elevated p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">
            Search symbol/notes
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className={controlClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Type</label>
          <select
            value={assetFilter}
            onChange={(e) =>
              onAssetFilterChange(e.target.value as typeof assetFilter)
            }
            className={controlClass}
          >
            <option value="all">All</option>
            <option value="stock">Stock</option>
            <option value="etf">ETF</option>
            <option value="crypto">Crypto</option>
            <option value="cash">Cash</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Action
          </label>
          <select
            value={actionFilter}
            onChange={(e) =>
              onActionFilterChange(e.target.value as typeof actionFilter)
            }
            className={controlClass}
          >
            <option value="all">All</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="inflow">Inflow</option>
            <option value="outflow">Outflow</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className={controlClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className={controlClass}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={!hasActiveFilters}
            className="rounded-lg border border-subtle bg-card px-3 py-1.5 text-sm transition-colors hover:border-gold disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 border-t border-subtle pt-3 text-xs text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{showingCount}</span> of{' '}
          <span className="font-medium text-foreground">{totalFiltered}</span>{' '}
          transactions
          {hasActiveFilters && ` (filtered from ${totalOriginal})`}
        </span>
        {totalFiltered > 0 && (
          <span>
            • {inflowCount} inflows • {outflowCount} outflows
          </span>
        )}
      </div>
    </div>
  )
}
