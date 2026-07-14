'use client'

import { useState } from 'react'

export type SortColumn = 'date' | 'symbol' | 'quantity' | 'price'
export type SortDirection = 'asc' | 'desc'

export interface UseTransactionSortingResult {
  sortColumn: SortColumn
  sortDirection: SortDirection
  handleSort: (column: SortColumn) => void
}

interface UseTransactionSortingOptions {
  defaultColumn?: SortColumn
  onSortChange?: () => void // e.g. to reset page
}

export function useTransactionSorting(
  options: UseTransactionSortingOptions = {}
): UseTransactionSortingResult {
  const { defaultColumn = 'date', onSortChange } = options

  const [sortColumn, setSortColumn] = useState<SortColumn>(defaultColumn)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setSortColumn(column)
      setSortDirection(column === 'date' ? 'desc' : 'asc')
    }
    onSortChange?.()
  }

  return {
    sortColumn,
    sortDirection,
    handleSort,
  }
}
