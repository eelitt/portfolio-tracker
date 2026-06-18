'use client'

import { useActionState } from 'react'
import { createTransaction, type ActionState } from '@/app/actions/transactions'
import { Toaster, toast } from 'sonner'
import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'

const initialState: ActionState = { error: undefined, success: false }
interface AddTransactionFormProps {
  onSuccess?: () => void
}

export default function AddTransactionForm({ onSuccess }: AddTransactionFormProps) {
  const [state, formAction, isPending] = useActionState(createTransaction, initialState)

  useEffect(() => {
    if (state.success) {
      toast.success('Transaction added successfully')
      onSuccess?.()
    }
    if (state.error) {
      const msg = typeof state.error === 'string' ? state.error : 'Validation error'
      toast.error(msg)
    }
  }, [state])

  return (
    <>
      <Toaster position="top-center" />
    
        <form action={formAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input name="symbol" placeholder="Symbol (AAPL, BTC)" className="border p-2 rounded" required />
          <select name="asset_type" className="border p-2 rounded" required>
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
          </select>
          <select name="action" className="border-gray-300 focus:border-gray-400 focus:ring-1 focus:ring-gray-200 p-2 rounded transition-colors" required>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <input name="quantity" type="number" step="any" placeholder="Quantity" className="border p-2 rounded" required />
          <input name="unit_price" type="number" step="any" placeholder="Price per unit" className="border p-2 rounded" required />
          <input name="executed_at" type="date" className="border p-2 rounded" required defaultValue={new Date().toISOString().split('T')[0]} />
          <input name="notes" placeholder="Notes (optional)" className="border p-2 rounded md:col-span-2" />
         <button 
            type="submit" 
            disabled={isPending} 
            className="md:col-span-2 flex items-center justify-center gap-2 bg-black text-white py-2.5 rounded disabled:opacity-70 transition-colors"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              'Add Transaction'
            )}
          </button>
        </form>
    </>
  )
}