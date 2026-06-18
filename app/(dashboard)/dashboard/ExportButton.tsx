'use client'

import { useState } from 'react'
import { exportTransactionsToCsv } from '@/lib/exportToCsv'
import { Loader2 } from 'lucide-react'

interface ExportButtonProps {
  transactions: any[]
}

export default function ExportButton({ transactions }: ExportButtonProps) {
  const [isPending, setIsPending] = useState(false)

  const handleExport = () => {
    setIsPending(true)
    exportTransactionsToCsv(transactions)
    // Short visual feedback since export is instant
    setTimeout(() => setIsPending(false), 400)
  }

  return (
    <button
      onClick={handleExport}
      disabled={isPending}
      className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors disabled:opacity-70"
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        'Export to CSV'
      )}
    </button>
  )
}