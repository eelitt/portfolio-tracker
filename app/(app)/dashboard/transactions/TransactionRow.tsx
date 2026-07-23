'use client'

import { Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAssetTypeLabel } from '@/lib/utils'
import type { Transaction } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import { formatQuantityCell, formatPriceCell, type AugmentedTransaction } from './transactionUtils'
import SensitiveValue from '@/components/SensitiveValue'

interface TransactionRowProps {
  tx: AugmentedTransaction
  preferredCurrency: PreferredCurrency
  usdToPreferredRate: number
  usdToEurRate: number
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
}

export default function TransactionRow({
  tx,
  preferredCurrency,
  usdToPreferredRate,
  usdToEurRate,
  onEdit,
  onDelete,
}: TransactionRowProps) {
  const displayDate =
    tx.formattedDate ??
    new Date(tx.executed_at).toLocaleDateString('fi-FI', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

  const isInflow = tx.action === 'buy' || tx.action === 'inflow'

  const qtyLabel = String(
    formatQuantityCell(tx, preferredCurrency, usdToPreferredRate, usdToEurRate)
  )
  const priceLabel = formatPriceCell(
    tx,
    preferredCurrency,
    usdToPreferredRate,
    usdToEurRate
  )
  // Long crypto prices (e.g. €1 676,99) use slightly smaller type so they stay one line
  const priceTextClass =
    priceLabel.replace(/\s/g, '').length >= 8 ? 'text-xs' : 'text-sm'

  return (
    <tr className="hover:bg-muted/50">
      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{displayDate}</td>
      <td className="px-4 py-3 font-medium">{tx.symbol}</td>
      <td className="px-4 py-3 text-sm">{getAssetTypeLabel(tx.asset_type)}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
            isInflow ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {isInflow ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {tx.action.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums whitespace-nowrap">
        <SensitiveValue value={qtyLabel} />
      </td>
      <td
        className={`px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap ${priceTextClass}`}
      >
        <SensitiveValue value={priceLabel} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-[200px]" title={tx.notes || ''}>
        {tx.notes || '-'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(tx)}
            className="h-8 w-8 text-blue-600 hover:bg-blue-600 hover:text-white transition-all active:scale-95"
            aria-label="Edit transaction"
          >
            <Pencil className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(tx)}
            className="h-8 w-8 text-red-600 hover:bg-red-600 hover:text-white transition-all active:scale-95"
            aria-label="Delete transaction"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}
