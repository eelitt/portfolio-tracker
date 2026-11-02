'use client'

/**
 * ImportTransactionsModal
 *
 * Allows users to import transactions by uploading a CSV file from an exchange or broker.
 *
 * Key design decisions:
 * - Uses AI (via parseCsvWithAI) to parse arbitrary CSV formats instead of hard-coded mappers.
 * - Enforces a hard 200-row client-side limit *before* any AI call to control token costs.
 * - Provides a fully editable preview so users can correct AI mistakes before saving.
 * - Communication with the Navbar dropdown happens via a custom DOM event ('open-csv-import').
 * - Reuses the existing transactionSchema for both client validation and the server action.
 */

import { useState, useTransition, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { parseCsvWithAI } from '@/app/actions/ai/csv-import/parseCsvWithAI'
import { importTransactions } from '@/app/actions/transactions'
import type { LedgerAssetType, TransactionAction } from '@/lib/types'
import type { TransactionFormData } from '@/lib/schemas'
import { transactionSchema } from '@/lib/schemas'
import { fromLocalInput, toLocalInput } from './FutureOrderFields'
import { historyActionLabel } from './transactionUtils'

interface ImportTransactionsModalProps {
  /** Optional custom trigger element (e.g. a button). If omitted, the modal can be opened via the 'open-csv-import' custom event. */
  trigger?: React.ReactNode
}

/** Local alias for the shape we work with in the preview table. */
type PreviewTx = TransactionFormData

export default function ImportTransactionsModal({ trigger }: ImportTransactionsModalProps) {
  // Controls visibility of the dialog
  const [open, setOpen] = useState(false)

  // useTransition is used for the AI parsing step so the UI can show a loading state
  // without blocking the main thread while the server action runs.
  const [isParsing, startParsing] = useTransition()

  // Separate loading state for the actual import (bulk save) action
  const [isImporting, setIsImporting] = useState(false)

  // The current list of transactions shown in the editable preview table.
  // This is the single source of truth the user can modify before saving.
  const [preview, setPreview] = useState<PreviewTx[]>([])

  // Non-fatal messages returned by the AI parser (e.g. "could not map fee column").
  const [warnings, setWarnings] = useState<string[]>([])

  // Reasons aligned with preview after a save leaves some rows unsaved.
  const [rowReasons, setRowReasons] = useState<(string | null)[]>([])

  // Used only for display in the preview header.
  const [fileName, setFileName] = useState('')

  // General error message shown above the preview (rate limit, empty file, >200 rows, etc.).
  const [error, setError] = useState<string | null>(null)

  /**
   * Clears all transient UI state.
   * Called when the dialog is closed and when a new file is selected.
   */
  const reset = () => {
    setPreview([])
    setWarnings([])
    setRowReasons([])
    setFileName('')
    setError(null)
  }

  /**
   * Closes the dialog and resets state.
   * We intentionally clear preview data on close to avoid showing stale data
   * if the user opens the importer again later.
   */
  const handleClose = () => {
    setOpen(false)
    // keep data briefly in case user wants to re-open, but clear on next open
    reset()
  }

  /**
   * React to the Dialog's open state.
   * When the dialog is dismissed (click outside, Escape, X button), we reset.
   */
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      reset()
    }
  }

  /**
   * Listen for the custom 'open-csv-import' event.
   *
   * This is how the Navbar dropdown opens the modal without needing a direct
   * prop or context. The event is dispatched from Navbar.tsx when the user
   * clicks "Import → Transactions (CSV)".
   *
   * We reset state first so every open starts fresh.
   */
  useEffect(() => {
    const handler = () => {
      reset()
      setOpen(true)
    }
    window.addEventListener('open-csv-import', handler as EventListener)
    return () => window.removeEventListener('open-csv-import', handler as EventListener)
  }, [])

  /**
   * Handles CSV file selection.
   *
   * Important flow:
   * 1. Basic client-side validation (must be .csv).
   * 2. Read file as text.
   * 3. **Immediately count rows** — this is the hard cost-protection gate.
   *    We refuse to call the AI at all if the file exceeds 200 rows.
   * 4. If under limit, call the server action `parseCsvWithAI`.
   * 5. Populate the preview state with the AI result (or show error/warnings).
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a .csv file')
      return
    }

    setError(null)
    setFileName(file.name)

    // useTransition gives us the isParsing flag while the async server action runs.
    startParsing(async () => {
      try {
        const text = await file.text()

        // HARD CLIENT-SIDE GATE — 200 rows max (before any AI call)
        // This is the primary mechanism to keep token usage and costs low.
        // We count non-empty lines and subtract 1 for the header.
        const lines = text.split('\n').filter((l) => l.trim().length > 0)
        const rowCount = Math.max(0, lines.length - 1) // minus header

        if (rowCount > 200) {
          setError(`This CSV has ${rowCount} rows. The importer supports a maximum of 200 rows. Please split the file by date and import in batches.`)
          setPreview([])
          return
        }

        if (rowCount === 0) {
          setError('The CSV appears to be empty.')
          return
        }

        // Call the AI-powered parser on the server.
        const result = await parseCsvWithAI(text)

        if (result.error) {
          setError(result.error)
          setPreview([])
          return
        }

        if (result.data) {
          setPreview(result.data.transactions || [])
          setRowReasons([])
          setWarnings(result.data.warnings || [])
          if ((result.data.transactions || []).length === 0) {
            setError('AI could not extract any transactions. You can add rows manually below.')
          }
        }
      } catch (err) {
        setError('Failed to read the file.')
        console.error(err)
      }
    })
  }

  /**
   * Updates a single field in the preview array (immutable update).
   *
   * Special handling:
   * - Changing asset_type resets the action (cash uses inflow/outflow, others use buy/sell).
   * - Future keeps a crypto symbol and shows side and amount.
   * - Cash always forces unit_price to 1.
   * - A blank number stays empty so an open can wait for margin.
   */
  const updatePreviewRow = (index: number, field: keyof PreviewTx, value: string) => {
    setRowReasons((prev) => {
      if (!prev[index]) return prev
      const next = [...prev]
      next[index] = null
      return next
    })
    setPreview((prev) => {
      const next = [...prev]
      const row = { ...next[index] }

      if (field === 'asset_type') {
        const prevType = row.asset_type
        const nextType = value as LedgerAssetType
        row.asset_type = nextType
        const keepSymbol =
          (prevType === 'crypto' && nextType === 'future') ||
          (prevType === 'future' && nextType === 'crypto')
        if (!keepSymbol) row.symbol = ''
        if (nextType === 'cash') {
          row.action = 'inflow'
          row.unit_price = 1
          row.amount = null
          row.position_side = null
        } else if (nextType === 'future') {
          if (row.action === 'inflow' || row.action === 'outflow') row.action = 'buy'
          row.position_side = row.position_side === 'short' ? 'short' : 'long'
          row.currency = 'USD'
        } else {
          if (row.action !== 'buy' && row.action !== 'sell') row.action = 'buy'
          row.amount = null
          row.position_side = null
        }
      } else if (field === 'action') {
        row.action = value as TransactionAction
        const wallet =
          value === 'funding' ||
          value === 'fee' ||
          value === 'margin_add' ||
          value === 'margin_remove'
        if (wallet) {
          row.quantity = null
          row.unit_price = null
        }
      } else if (field === 'position_side') {
        row.position_side = value === 'short' ? 'short' : 'long'
      } else if (field === 'quantity' || field === 'unit_price' || field === 'amount') {
        row[field] = value === '' ? null : Number(value)
      } else if (field === 'executed_at') {
        row.executed_at = value.includes('T') ? fromLocalInput(value) : value
      } else if (field === 'symbol' || field === 'notes') {
        row[field] = value
      }

      next[index] = row
      return next
    })
  }

  /** Removes a row from the preview. */
  const deleteRow = (index: number) => {
    setPreview((prev) => prev.filter((_, i) => i !== index))
    setRowReasons((prev) => prev.filter((_, i) => i !== index))
  }

  /**
   * Adds a blank row the user can fill in manually.
   * This is useful when the AI missed some transactions or the user wants to add extra entries.
   */
  const addEmptyRow = () => {
    const newRow: PreviewTx = {
      symbol: '',
      asset_type: 'stock',
      action: 'buy',
      quantity: 0,
      unit_price: 0,
      executed_at: new Date().toISOString().split('T')[0],
      notes: '',
      currency: undefined,
    }
    setPreview((prev) => [...prev, newRow])
  }

  /**
   * Runs the same Zod schema used on the server to determine if a row is valid.
   * Invalid rows are visually highlighted and prevented from being imported.
   */
  const isRowValid = (tx: PreviewTx) => {
    const result = transactionSchema.safeParse(tx)
    return result.success
  }

  /** Derived value: how many rows currently pass validation. */
  const validCount = preview.filter(isRowValid).length

  /**
   * Sends the user-reviewed transactions to the server for bulk import.
   *
   * - Only validated rows are sent.
   * - On success we fire the 'portfolio-updated' event so other parts of the dashboard
   *   (Holdings, Summary, Transaction History) can refresh.
   * - Partial failures are shown in the error banner.
   */
  const handleImport = async () => {
    if (preview.length === 0) return

    setIsImporting(true)
    setError(null)

    try {
      const result = await importTransactions(preview)
      const blocked = result.skipped.filter((row) => row.index < 0)
      if (blocked.length > 0) {
        setError(blocked.map((row) => row.reason).join(' • '))
        return
      }

      if (result.imported > 0) {
        toast.success(`Imported ${result.imported} transaction(s)`)
        window.dispatchEvent(new CustomEvent('portfolio-updated'))
      }

      if (result.skipped.length > 0) {
        const kept = preview
          .map((row, index) => ({
            row,
            reason: result.skipped.find((item) => item.index === index)?.reason ?? null,
          }))
          .filter((item) => item.reason)
        setPreview(kept.map((item) => item.row))
        setRowReasons(kept.map((item) => item.reason))
      } else if (result.imported > 0) {
        handleClose()
      }
    } catch (e) {
      setError('Import failed. Please try again.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Only render a trigger if one was explicitly passed in (rarely used).
          Most of the time the modal is opened via the custom event from the Navbar. */}
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[920px] max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Import Transactions from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* === File selection area (shown only before we have a preview) === */}
          {!preview.length && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Select CSV file exported from your exchange or broker
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm border p-2 rounded cursor-pointer"
                disabled={isParsing}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum 200 rows supported. AI will parse the file. You can edit every field before importing.
              </p>
            </div>
          )}

          {/* AI parsing loading indicator */}
          {isParsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI is parsing your CSV...
            </div>
          )}

          {/* General error / blocking message (rate limit, too many rows, parse failure, etc.) */}
          {error && (
            <div className="alert-error">
              {error}
            </div>
          )}

          {rowReasons.some(Boolean) && (
            <div className="alert-warning">
              <div className="font-medium mb-1">These rows were not saved:</div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                {preview.map((tx, index) =>
                  rowReasons[index] ? (
                    <li key={index}>
                      {tx.symbol || 'Row'}: {rowReasons[index]}
                    </li>
                  ) : null
                )}
              </ul>
            </div>
          )}

          {/* Non-fatal warnings returned by the AI parser */}
          {warnings.length > 0 && (
            <div className="alert-warning">
              <div className="font-medium mb-1">AI warnings:</div>
              <ul className="list-disc pl-5 space-y-0.5 text-xs">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* === Editable Preview Table === */}
          {preview.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    Preview — {preview.length} transactions from {fileName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Edit any field. A future row can set side and margin. Rows that fail stay in this list with the reason.
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={addEmptyRow}>
                  <Plus className="h-4 w-4 mr-1" /> Add row
                </Button>
              </div>

              {/* The preview is a simple native table with controlled inputs.
                  Each row can be edited independently. Invalid rows get a light red background. */}
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-2 text-left">Date</th>
                      <th className="px-2 py-2 text-left">Symbol</th>
                      <th className="px-2 py-2 text-left">Type</th>
                      <th className="px-2 py-2 text-left">Side</th>
                      <th className="px-2 py-2 text-left">Action</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Price</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                      <th className="px-2 py-2 text-left">Notes</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((tx, index) => {
                      const valid = isRowValid(tx)
                      const wallet =
                        tx.action === 'funding' ||
                        tx.action === 'fee' ||
                        tx.action === 'margin_add' ||
                        tx.action === 'margin_remove'
                      const dated = tx.executed_at?.includes('T')
                      return (
                        <tr
                          key={index}
                          className={!valid || rowReasons[index] ? 'bg-destructive/10' : ''}
                          title={rowReasons[index] || undefined}
                        >
                          {/* Executed date. A clock time stays on the row. */}
                          <td className="px-2 py-1.5">
                            <input
                              type={dated ? 'datetime-local' : 'date'}
                              value={dated ? toLocalInput(tx.executed_at, true) : (tx.executed_at?.slice(0, 10) || '')}
                              onChange={(e) => updatePreviewRow(index, 'executed_at', e.target.value)}
                              className="border p-1 rounded w-40 text-xs"
                            />
                          </td>
                          {/* Symbol (auto-uppercased on change) */}
                          <td className="px-2 py-1.5">
                            <input
                              value={tx.symbol}
                              onChange={(e) => updatePreviewRow(index, 'symbol', e.target.value.toUpperCase())}
                              className="border p-1 rounded w-28 text-xs font-mono"
                              placeholder="AAPL"
                            />
                          </td>
                          {/* Asset type select — changing this affects the Action options below */}
                          <td className="px-2 py-1.5">
                            <select
                              value={tx.asset_type}
                              onChange={(e) => updatePreviewRow(index, 'asset_type', e.target.value)}
                              className="border p-1 rounded text-xs"
                            >
                              <option value="stock">Stock</option>
                              <option value="etf">ETF</option>
                              <option value="crypto">Crypto</option>
                              <option value="future">Future</option>
                              <option value="cash">Cash</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            {tx.asset_type === 'future' ? (
                              <select
                                value={tx.position_side === 'short' ? 'short' : 'long'}
                                onChange={(e) => updatePreviewRow(index, 'position_side', e.target.value)}
                                className="border p-1 rounded text-xs"
                              >
                                <option value="long">Long</option>
                                <option value="short">Short</option>
                              </select>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          {/* Action — buy/sell, cash, or a future wallet action */}
                          <td className="px-2 py-1.5">
                            <select
                              value={tx.action}
                              onChange={(e) => updatePreviewRow(index, 'action', e.target.value)}
                              className="border p-1 rounded text-xs"
                            >
                              {tx.asset_type === 'cash' ? (
                                <>
                                  <option value="inflow">Inflow</option>
                                  <option value="outflow">Outflow</option>
                                </>
                              ) : tx.asset_type === 'future' ? (
                                <>
                                  <option value="buy">{historyActionLabel('buy')}</option>
                                  <option value="sell">{historyActionLabel('sell')}</option>
                                  <option value="funding">{historyActionLabel('funding')}</option>
                                  <option value="fee">{historyActionLabel('fee')}</option>
                                  <option value="margin_add">{historyActionLabel('margin_add')}</option>
                                  <option value="margin_remove">{historyActionLabel('margin_remove')}</option>
                                </>
                              ) : (
                                <>
                                  <option value="buy">Buy</option>
                                  <option value="sell">Sell</option>
                                </>
                              )}
                            </select>
                          </td>
                          {/* Quantity */}
                          <td className="px-2 py-1.5 text-right">
                            {tx.asset_type === 'future' && wallet ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              <input
                                type="number"
                                step="any"
                                value={tx.quantity ?? ''}
                                onChange={(e) => updatePreviewRow(index, 'quantity', e.target.value)}
                                className="border p-1 rounded w-20 text-xs text-right font-mono"
                              />
                            )}
                          </td>
                          {/* Unit price — hidden / forced to 1 for cash rows */}
                          <td className="px-2 py-1.5 text-right">
                            {tx.asset_type === 'cash' || (tx.asset_type === 'future' && wallet) ? (
                              <span className="text-muted-foreground text-xs">{tx.asset_type === 'cash' ? '1' : '—'}</span>
                            ) : (
                              <input
                                type="number"
                                step="any"
                                value={tx.unit_price ?? ''}
                                onChange={(e) => updatePreviewRow(index, 'unit_price', e.target.value)}
                                className="border p-1 rounded w-20 text-xs text-right font-mono"
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {tx.asset_type === 'future' ? (
                              <input
                                type="number"
                                step="any"
                                value={tx.amount ?? ''}
                                onChange={(e) => updatePreviewRow(index, 'amount', e.target.value)}
                                className="border p-1 rounded w-20 text-xs text-right font-mono"
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          {/* Free-text notes */}
                          <td className="px-2 py-1.5">
                            <input
                              value={tx.notes || ''}
                              onChange={(e) => updatePreviewRow(index, 'notes', e.target.value)}
                              className="border p-1 rounded w-40 text-xs"
                              placeholder="Optional"
                            />
                          </td>
                          {/* Delete row button */}
                          <td className="px-2 py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteRow(index)}
                              className="h-7 w-7 text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer with validation summary and primary actions */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-muted-foreground">
                  {validCount} of {preview.length} rows are valid
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={isImporting || preview.length === 0}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Importing...
                      </>
                    ) : (
                      `Import ${preview.length} transaction${preview.length === 1 ? '' : 's'}`
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Empty state shown when no file has been processed yet */}
          {preview.length === 0 && !isParsing && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Select a CSV file to begin. The AI will attempt to parse exchange exports automatically.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
