'use client'

import { useState, useMemo, useEffect } from 'react'

export interface UsePaginationResult<T> {
  currentPage: number
  setCurrentPage: (page: number) => void
  paginatedItems: T[]
  totalPages: number
  pageSize: number
}

export function usePagination<T>(
  items: T[],
  pageSize: number = 25
): UsePaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, currentPage, pageSize])

  // When the underlying list shrinks (due to filters), clamp the page
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return {
    currentPage,
    setCurrentPage,
    paginatedItems,
    totalPages,
    pageSize,
  }
}
