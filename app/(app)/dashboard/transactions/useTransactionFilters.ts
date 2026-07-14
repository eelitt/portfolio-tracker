'use client'

import { useState, useEffect } from 'react'
import type { Transaction } from '@/lib/types'

export type AssetFilter = 'all' | Transaction['asset_type']
export type ActionFilter = 'all' | Transaction['action']

export interface UseTransactionFiltersResult {
  searchTerm: string
  setSearchTerm: (value: string) => void
  assetFilter: AssetFilter
  setAssetFilter: (value: AssetFilter) => void
  actionFilter: ActionFilter
  setActionFilter: (value: ActionFilter) => void
  dateFrom: string
  setDateFrom: (value: string) => void
  dateTo: string
  setDateTo: (value: string) => void

  clearFilters: () => void
  hasActiveFilters: boolean
}

export function useTransactionFilters(): UseTransactionFiltersResult {
  const [searchTerm, setSearchTerm] = useState('')
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const clearFilters = () => {
    setSearchTerm('')
    setAssetFilter('all')
    setActionFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = Boolean(
    searchTerm || assetFilter !== 'all' || actionFilter !== 'all' || dateFrom || dateTo
  )

  return {
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
  }
}
