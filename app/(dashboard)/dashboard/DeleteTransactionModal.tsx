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
import { formatCurrency } from '@/lib/currency'
import type { PreferredCurrency } from '@/app/actions/users'

interface DeleteTransactionModalProps {
  transaction: Transaction | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (id: string) => void
  isPending?: boolean
  preferredCurrency?: PreferredCurrency
  usdToPreferredRate?: number
}

export default function DeleteTransactionModal({
  transaction,
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  preferredCurrency,
  usdToPreferredRate,
}: DeleteTransactionModalProps) {
  if (!transaction) return null

  const formattedDate = new Date(transaction.executed_at).toLocaleDateString('fi-FI', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

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
        <div className="rounded-lg border bg-gray-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">Symbol</span>
            <span className="font-semibold">{transaction.symbol}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Type</span>
            <span>{getAssetTypeLabel(transaction.asset_type)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Action</span>
            <span className={transaction.action === 'buy' ? 'text-green-600' : 'text-red-600'}>
              {transaction.action.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Quantity</span>
            <span>{transaction.quantity}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Price</span>
            <span>
              {formatCurrency(
                transaction.unit_price, 
                preferredCurrency || 'USD', 
                transaction.asset_type === 'cash' ? 1 : (usdToPreferredRate || 1)
              )}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-600">Date</span>
            <span suppressHydrationWarning>{formattedDate}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
          variant="outline" 
          onClick={onClose} 
          disabled={isPending}
          className="flex-1 hover:bg-gray-200"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(transaction.id)}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white disabled:opacity-70 transition-colors"
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