'use client'

import { exportTransactionsToCsv } from '@/lib/exportToCsv'

interface ExportButtonProps {
  transactions: any[]
}

export default function ExportButton({ transactions }: ExportButtonProps) {
  const handleExport = () => {
    exportTransactionsToCsv(transactions)
  }

  return (
    <button
      onClick={handleExport}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
    >
      Export to CSV
    </button>
  )
}