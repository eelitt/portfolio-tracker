'use client'

import type { Transaction } from '@/lib/types'

interface TransactionFiltersProps {
  // Search
  searchTerm: string
  onSearchChange: (value: string) => void

  // Filters
  assetFilter: 'all' | Transaction['asset_type']
  onAssetFilterChange: (value: 'all' | Transaction['asset_type']) => void

  actionFilter: 'all' | Transaction['action']
  onActionFilterChange: (value: 'all' | Transaction['action']) => void

  dateFrom: string
  onDateFromChange: (value: string) => void

  dateTo: string
  onDateToChange: (value: string) => void

  // Actions
  onClear: () => void
  hasActiveFilters: boolean

  // Stats (displayed inside the panel)
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
  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-muted-foreground mb-1">Search symbol/notes</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Type</label>
          <select
            value={assetFilter}
            onChange={(e) => onAssetFilterChange(e.target.value as any)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="all">All</option>
            <option value="stock">Stock</option>
            <option value="etf">ETF</option>
            <option value="crypto">Crypto</option>
            <option value="cash">Cash</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => onActionFilterChange(e.target.value as any)}
            className="border rounded px-3 py-1.5 text-sm bg-background"
          >
            <option value="all">All</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="inflow">Inflow</option>
            <option value="outflow">Outflow</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm bg-background"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm bg-background"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClear}
            disabled={!hasActiveFilters}
            className="text-sm px-3 py-1.5 border rounded disabled:opacity-50 hover:bg-muted"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Stats row inside the filter panel */}
      <div className="mt-3 text-xs text-muted-foreground flex flex-wrap gap-x-4 border-t pt-3">
        <span>
          Showing <span className="font-medium">{showingCount}</span> of{' '}
          <span className="font-medium">{totalFiltered}</span> transactions
          {hasActiveFilters && ` (filtered from ${totalOriginal})`}
        </span>
        {totalFiltered > 0 && (
          <span className="text-muted-foreground/70">
            • {inflowCount} inflows • {outflowCount} outflows
          </span>
        )}
      </div>
    </div>
  )
}
