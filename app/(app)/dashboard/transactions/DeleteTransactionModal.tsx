'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Transaction } from '@/lib/types'
import { Loader2 } from 'lucide-react'
import { getAssetTypeLabel } from '@/lib/utils'
import type { PreferredCurrency } from '@/lib/userTypes'
import SensitiveValue from '@/components/SensitiveValue'
import {
  formatPriceCell,
  formatQuantityCell,
  historyActionLabel,
  historySymbolLabel,
} from './transactionUtils'

interface DeleteTransactionModalProps {
  transaction: Transaction | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (id: string) => void
  isPending?: boolean
  preferredCurrency?: PreferredCurrency
  usdToPreferredRate?: number
  usdToEurRate?: number
}

export default function DeleteTransactionModal({
  transaction,
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  preferredCurrency,
  usdToPreferredRate,
  usdToEurRate,
}: DeleteTransactionModalProps) {
  if (!transaction) return null

  const formattedDate = new Date(transaction.executed_at).toLocaleDateString('fi-FI', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  const preferred = preferredCurrency || 'USD'
  const qtyLabel = String(
    formatQuantityCell(transaction, preferred, usdToPreferredRate || 1, usdToEurRate || 0.92)
  )
  const priceLabel = formatPriceCell(
    transaction,
    preferred,
    usdToPreferredRate || 1,
    usdToEurRate || 0.92
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px] shadow-xl rounded-xl border ring-0">
        <DialogHeader>
          <DialogTitle>Delete Transaction</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this transaction? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Summary */}
        <div className="rounded-lg border border-border/70 bg-muted/40 p-4 text-sm">
          <div className="flex justify-between">
            <span className="font-medium text-foreground">Symbol</span>
            <span className="font-semibold">{historySymbolLabel(transaction)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Type</span>
            <span>{getAssetTypeLabel(transaction.asset_type)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Action</span>
            <span className={(transaction.action === 'buy' || transaction.action === 'inflow') ? 'text-green-600' : 'text-red-600'}>
              {historyActionLabel(transaction.action)}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Quantity</span>
            <span>
              {qtyLabel === '' ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <SensitiveValue value={qtyLabel} />
              )}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Price</span>
            <span>
              {priceLabel === '' ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <SensitiveValue value={priceLabel} />
              )}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Date</span>
            <span suppressHydrationWarning>{formattedDate}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
          variant="outline" 
          onClick={onClose} 
          disabled={isPending}
          className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(transaction.id!)}
            disabled={isPending}
            className="flex flex-1 items-center justify-center gap-2 transition-colors disabled:opacity-70"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Transaction'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}