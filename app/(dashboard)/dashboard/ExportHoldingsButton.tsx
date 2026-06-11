'use client'

import { exportHoldingsToCsv } from '@/lib/exportToCsv'

interface ExportHoldingsButtonProps {
  holdings: any[]
}

export default function ExportHoldingsButton({ holdings }: ExportHoldingsButtonProps) {
  const handleExport = () => {
    exportHoldingsToCsv(holdings)
  }

  return (
    <button
      onClick={handleExport}
      className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm transition-colors"
    >
      Export Holdings
    </button>
  )
}