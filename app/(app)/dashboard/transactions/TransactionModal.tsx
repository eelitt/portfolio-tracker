'use client'

/**
 * Dialog for add (header trigger / holding prefill) and edit (from table).
 * Trigger is the sole primary CTA in the dashboard toolbar; form fields share formStyles.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import AddTransactionForm from './AddTransactionForm'
import SymbolSelect from './SymbolSelect'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'
import { updateTransaction } from '@/app/actions/transactions'
import { toast } from 'sonner'
import { Transaction } from '@/lib/types'
import type { AssetType } from '@/lib/types'
import { fieldClassName, labelClassName } from './formStyles'
import type { PreferredCurrency } from '@/lib/userTypes'
import {
  getCurrencySymbol,
  unitPriceShownInPreferred,
  unitPriceToStore,
} from '@/lib/currency'

interface TransactionModalProps {
  transaction?: Transaction | null
  trigger?: React.ReactNode
  onClose?: () => void
  /** Currency the unit-price field shows. New rows are stored in this currency. */
  preferredCurrency?: PreferredCurrency
  usdToEurRate?: number
}

export default function TransactionModal({
  transaction,
  trigger,
  onClose,
  preferredCurrency = 'USD',
  usdToEurRate = 0.92,
}: TransactionModalProps) {
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const [editAssetType, setEditAssetType] = useState<AssetType>('stock')
  const [editSymbol, setEditSymbol] = useState('')
  const [editAction, setEditAction] = useState<
    'buy' | 'sell' | 'inflow' | 'outflow'
  >('buy')
  const [editUnitPrice, setEditUnitPrice] = useState<number>(1)
  const [editPriceBaseline, setEditPriceBaseline] = useState<number>(1)

  type AddPrefill = {
    assetType?: AssetType
    symbol?: string
    action?: 'buy' | 'sell' | 'inflow' | 'outflow'
  }
  const [addPrefill, setAddPrefill] = useState<AddPrefill | null>(null)
  const [addFormKey, setAddFormKey] = useState(0)

  useEffect(() => {
    if (transaction) {
      setOpen(true)
      setEditAssetType(transaction.asset_type as AssetType)
      setEditSymbol(transaction.symbol)
      setEditAction(transaction.action as 'buy' | 'sell' | 'inflow' | 'outflow')
      const entry = (transaction.currency || 'USD') as PreferredCurrency
      const shown =
        transaction.asset_type === 'cash'
          ? transaction.unit_price
          : unitPriceShownInPreferred(
              transaction.unit_price,
              entry,
              preferredCurrency,
              usdToEurRate
            )
      setEditUnitPrice(shown)
      setEditPriceBaseline(shown)
    }
  }, [transaction, preferredCurrency, usdToEurRate])

  // Holdings cards dispatch add-transaction; only the add instance listens
  useEffect(() => {
    if (transaction !== undefined) return

    const handleAddForHolding = (
      e: CustomEvent<{
        asset_type?: AssetType
        symbol?: string
        action?: 'buy' | 'sell' | 'inflow' | 'outflow'
      }>
    ) => {
      const d = e.detail || {}
      if (!d.symbol) return
      const isCash = d.asset_type === 'cash'
      setAddPrefill({
        assetType: d.asset_type,
        symbol: d.symbol,
        action: d.action ?? (isCash ? 'inflow' : 'sell'),
      })
      setAddFormKey((k) => k + 1)
      setOpen(true)
    }

    window.addEventListener(
      'add-transaction',
      handleAddForHolding as EventListener
    )
    return () =>
      window.removeEventListener(
        'add-transaction',
        handleAddForHolding as EventListener
      )
  }, [transaction])

  const isEdit = !!transaction
  const title = isEdit
    ? 'Edit transaction'
    : addPrefill?.symbol
      ? `Add transaction for ${addPrefill.symbol}`
      : 'Add transaction'

  const handleClose = () => {
    setOpen(false)
    setAddPrefill(null)
    onClose?.()
  }

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!transaction) return

    setIsPending(true)
    const formData = new FormData(e.currentTarget)
    if (editAssetType !== 'cash') {
      const entered = Number(formData.get('unit_price'))
      const entry = (transaction.currency || 'USD') as PreferredCurrency
      formData.set(
        'unit_price',
        String(
          unitPriceToStore(
            entered,
            editPriceBaseline,
            transaction.unit_price,
            entry,
            preferredCurrency,
            usdToEurRate
          )
        )
      )
    }
    const result = await updateTransaction(transaction.id!, formData)
    setIsPending(false)

    if (result?.error) {
      toast.error(
        typeof result.error === 'string' ? result.error : 'Failed to update'
      )
    } else {
      toast.success('Transaction updated')
      window.dispatchEvent(new CustomEvent('portfolio-updated'))
      handleClose()
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setAddPrefill(null)
      onClose?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Trigger only for standalone add (not edit-from-table instance) */}
      {transaction === undefined && (
        <DialogTrigger asChild>
          {trigger || (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={() => {
                setAddPrefill(null)
                setAddFormKey((k) => k + 1)
              }}
            >
              <Plus className="h-4 w-4" />
              Add transaction
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent
        className="sm:max-w-[520px] gap-4 rounded-xl p-6 shadow-xl"
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit
              ? 'Update the details of this transaction.'
              : 'Record a buy, sell, or cash movement.'}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <form key={transaction.id} onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="edit-asset-type" className={labelClassName}>
                  Asset type
                </label>
                <select
                  id="edit-asset-type"
                  name="asset_type"
                  value={editAssetType}
                  onChange={(e) => {
                    const newType = e.target.value as AssetType
                    setEditAssetType(newType)
                    setEditSymbol('')
                    if (newType === 'cash') {
                      setEditAction('inflow')
                      setEditUnitPrice(1)
                    }
                  }}
                  className={fieldClassName}
                  required
                >
                  <option value="stock">Stock</option>
                  <option value="etf">ETF / Index Fund</option>
                  <option value="crypto">Crypto</option>
                  <option value="cash">Cash / Savings</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-symbol" className={labelClassName}>
                  Symbol
                </label>
                <SymbolSelect
                  assetType={editAssetType}
                  value={editSymbol}
                  onChange={setEditSymbol}
                  className={fieldClassName}
                  preserveSymbolForEdit={transaction.symbol}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="edit-action" className={labelClassName}>
                  Action
                </label>
                <select
                  id="edit-action"
                  name="action"
                  value={
                    editAssetType === 'cash'
                      ? editAction === 'buy' || editAction === 'inflow'
                        ? 'inflow'
                        : 'outflow'
                      : editAction
                  }
                  onChange={(e) =>
                    setEditAction(
                      e.target.value as 'buy' | 'sell' | 'inflow' | 'outflow'
                    )
                  }
                  className={fieldClassName}
                  required
                >
                  {editAssetType === 'cash' ? (
                    <>
                      <option value="inflow">Inflow</option>
                      <option value="outflow">Outflow</option>
                    </>
                  ) : (
                    <>
                      <option value="buy">Buy</option>
                      <option value="sell">Sell</option>
                    </>
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="edit-quantity" className={labelClassName}>
                  Quantity
                </label>
                <input
                  id="edit-quantity"
                  name="quantity"
                  type="number"
                  step="any"
                  defaultValue={transaction.quantity}
                  className={fieldClassName}
                  required
                />
              </div>
            </div>

            {editAssetType !== 'cash' ? (
              <div className="space-y-1.5">
                <label htmlFor="edit-unit-price" className={labelClassName}>
                  Unit price ({getCurrencySymbol(preferredCurrency)})
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {getCurrencySymbol(preferredCurrency)}
                  </span>
                  <input
                    id="edit-unit-price"
                    name="unit_price"
                    type="number"
                    step="any"
                    value={editUnitPrice}
                    onChange={(e) =>
                      setEditUnitPrice(parseFloat(e.target.value) || 1)
                    }
                    className={`${fieldClassName} pl-8`}
                    required
                  />
                </div>
              </div>
            ) : (
              <input type="hidden" name="unit_price" value={editUnitPrice} />
            )}

            <div className="space-y-1.5">
              <label htmlFor="edit-executed-at" className={labelClassName}>
                Executed at
              </label>
              <input
                id="edit-executed-at"
                name="executed_at"
                type="date"
                defaultValue={transaction.executed_at.split('T')[0]}
                className={fieldClassName}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-notes" className={labelClassName}>
                Notes
              </label>
              <input
                id="edit-notes"
                name="notes"
                defaultValue={transaction.notes || ''}
                placeholder="Optional"
                className={fieldClassName}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} size="sm">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </form>
        ) : (
          <AddTransactionForm
            key={addFormKey}
            onSuccess={handleClose}
            initialAssetType={addPrefill?.assetType}
            initialSymbol={addPrefill?.symbol}
            initialAction={addPrefill?.action}
            preferredCurrency={preferredCurrency}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
