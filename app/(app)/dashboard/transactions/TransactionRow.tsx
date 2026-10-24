'use client'

import { Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAssetTypeLabel } from '@/lib/utils'
import type { Transaction } from '@/lib/types'
import type { PreferredCurrency } from '@/lib/userTypes'
import { formatQuantityCell, formatPriceCell, type AugmentedTransaction } from './transactionUtils'
import { formatCurrency } from '@/lib/currency'
import type { TransactionPnlRow } from '@/lib/transactionPnl'
import SensitiveValue from '@/components/SensitiveValue'

function PnlCell({
  pnl,
  preferredCurrency,
}: {
  pnl?: TransactionPnlRow
  preferredCurrency: PreferredCurrency
}) {
  if (!pnl || pnl.kind === 'none') {
    return <span className="text-muted-foreground">—</span>
  }
  if (pnl.kind === 'closed') {
    return <span className="text-muted-foreground">Closed</span>
  }
  const amount = pnl.amount ?? 0
  const color = amount >= 0 ? 'text-pnl-positive' : 'text-pnl-negative'
  return (
    <span className={`inline-flex flex-col items-end whitespace-nowrap ${color}`}>
      <SensitiveValue value={formatCurrency(amount, preferredCurrency, 1)} />
      {pnl.percent !== undefined && (
        <span className="text-xs">
          (
          <SensitiveValue value={`${pnl.percent.toFixed(1)}%`} />
          )
        </span>
      )}
    </span>
  )
}

interface TransactionRowProps {
  tx: AugmentedTransaction
  preferredCurrency: PreferredCurrency
  usdToPreferredRate: number
  usdToEurRate: number
  pnl?: TransactionPnlRow
  /** When the action column does not fit, the row opens the edit/remove menu. */
  compact?: boolean
  onOpenMenu?: (tx: Transaction, point: { x: number; y: number }) => void
  onEdit: (tx: Transaction) => void
  onDelete: (tx: Transaction) => void
}

export default function TransactionRow({
  tx,
  preferredCurrency,
  usdToPreferredRate,
  usdToEurRate,
  pnl,
  compact = false,
  onOpenMenu,
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

  const openMenuAt = (point: { x: number; y: number }) => {
    onOpenMenu?.(tx, point)
  }

  return (
    <tr
      className={`relative transition-transform duration-200 ease-out hover:z-10 hover:scale-[1.012] hover:bg-muted/50 [&>td]:border-b [&>td]:border-subtle ${compact ? 'cursor-pointer focus-visible:bg-muted/70' : ''}`}
      onClick={
        compact
          ? (event) => openMenuAt({ x: event.clientX, y: event.clientY })
          : undefined
      }
      onKeyDown={
        compact
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              const rect = event.currentTarget.getBoundingClientRect()
              openMenuAt({ x: rect.left + 16, y: rect.top + rect.height / 2 })
            }
          : undefined
      }
      tabIndex={compact ? 0 : undefined}
      role={compact ? 'button' : undefined}
      aria-haspopup={compact ? 'menu' : undefined}
      aria-label={compact ? `Edit or remove ${tx.symbol}` : undefined}
    >
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">
        {displayDate}
      </td>
      <td className="px-4 py-3 font-medium">{tx.symbol}</td>
      <td className="px-4 py-3 text-sm">{getAssetTypeLabel(tx.asset_type)}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
            isInflow
              ? 'bg-green-500/15 text-green-400'
              : 'bg-red-500/15 text-red-400'
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
      <td className="px-4 py-3 text-right font-mono text-sm tabular-nums">
        <PnlCell pnl={pnl} preferredCurrency={preferredCurrency} />
      </td>
      <td
        className="max-w-[200px] truncate px-4 py-3 text-sm text-muted-foreground"
        title={tx.notes || ''}
      >
        {tx.notes || '-'}
      </td>
      {!compact && (
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
      )}
    </tr>
  )
}
