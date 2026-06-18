'use client'

import { useState } from 'react'
import { exportHoldingsToCsv } from '@/lib/exportToCsv'
import { Loader2 } from 'lucide-react'

interface ExportHoldingsButtonProps {
  holdings: any[]
}

export default function ExportHoldingsButton({ holdings }: ExportHoldingsButtonProps) {
  const [isPending, setIsPending] = useState(false)

  const handleExport = () => {
    setIsPending(true)
    exportHoldingsToCsv(holdings)
    // Short visual feedback since export is instant
    setTimeout(() => setIsPending(false), 400)
  }

  return (
    <button
      onClick={handleExport}
      disabled={isPending}
      className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm transition-colors disabled:opacity-70"
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        'Export Holdings'
      )}
    </button>
  )
}