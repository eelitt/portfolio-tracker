'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SymbolSelect from '../transactions/SymbolSelect'
import { fieldClassName, labelClassName } from '../transactions/formStyles'
import { addWatchlistItem } from '@/app/actions/watchlist'
import type { WatchlistAssetType } from '@/lib/types'

export default function AddWatchlistForm({
  heldSymbols = [],
}: {
  /** Open holdings of the current type — omitted from the picker. */
  heldSymbols?: Array<{ symbol: string; asset_type: WatchlistAssetType }>
}) {
  const router = useRouter()
  const [assetType, setAssetType] = useState<WatchlistAssetType>('stock')
  const [symbol, setSymbol] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleAssetTypeChange = (next: WatchlistAssetType) => {
    setAssetType(next)
    setSymbol('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!symbol) {
      toast.error('Select a symbol')
      return
    }

    startTransition(async () => {
      const result = await addWatchlistItem({ symbol, asset_type: assetType })
      if (result.error || !result.data) {
        toast.error(result.error || 'Could not add to watchlist')
        return
      }
      toast.success(`${result.data.symbol} added to watchlist`)
      setSymbol('')
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 flex flex-col gap-3 rounded-xl border border-subtle bg-surface-elevated p-4 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <label htmlFor="watch-asset-type" className={labelClassName}>
          Type
        </label>
        <select
          id="watch-asset-type"
          value={assetType}
          onChange={(e) =>
            handleAssetTypeChange(e.target.value as WatchlistAssetType)
          }
          className={fieldClassName}
          disabled={isPending}
        >
          <option value="stock">Stock</option>
          <option value="etf">ETF / Index</option>
          <option value="crypto">Crypto</option>
        </select>
      </div>
      <div className="min-w-0 flex-[2] space-y-1.5">
        <label htmlFor="watch-symbol" className={labelClassName}>
          Symbol
        </label>
        <SymbolSelect
          assetType={assetType}
          value={symbol}
          onChange={setSymbol}
          className={fieldClassName}
          required
          excludeSymbols={heldSymbols
            .filter((h) => h.asset_type === assetType)
            .map((h) => h.symbol)}
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending || !symbol} className="gap-1.5">
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        Watch
      </Button>
    </form>
  )
}
