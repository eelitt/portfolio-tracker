/**
 * Client-side CSV export helpers.
 *
 * These run in the browser, build a Blob, and trigger a download.
 * They are intentionally simple (no server round-trip for exports).
 */

/** Prefix values that Excel/Sheets may treat as formulas. */
function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`
  return value
}

/** RFC4180-style cell: formula-safe + quote when needed. */
function csvCell(value: unknown): string {
  const s = neutralizeFormula(String(value ?? ''))
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n')
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

/**
 * Exports the full transaction history as CSV.
 * Columns: Date, Symbol, Type, Action, Quantity, Price, Total Value, Notes
 */
export function exportTransactionsToCsv(transactions: any[]) {
  if (!transactions || transactions.length === 0) {
    alert('No transactions to export')
    return
  }

  const headers = [
    'Date',
    'Symbol',
    'Type',
    'Action',
    'Quantity',
    'Price',
    'Total Value',
    'Notes',
  ]

  const rows = transactions.map((tx) => {
    const totalValue = (tx.quantity * tx.unit_price).toFixed(2)
    const date = new Date(tx.executed_at).toISOString().split('T')[0]

    return [
      date,
      tx.symbol,
      tx.asset_type,
      tx.action,
      tx.quantity,
      tx.unit_price,
      totalValue,
      tx.notes || '',
    ]
  })

  downloadCsv(
    `transactions-${new Date().toISOString().split('T')[0]}.csv`,
    toCsv(headers, rows)
  )
}

/**
 * Exports the current computed holdings snapshot as CSV.
 * Includes live price columns (Current Price, Market Value, Unrealized P&L, etc.)
 */
export function exportHoldingsToCsv(holdings: any[]) {
  if (!holdings || holdings.length === 0) {
    alert('No holdings to export')
    return
  }

  const headers = [
    'Symbol',
    'Type',
    'Quantity',
    'Avg Cost',
    'Current Price',
    'Market Value',
    'Unrealized P&L',
    'Unrealized P&L %',
  ]

  const rows = holdings.map((h) => [
    h.symbol,
    h.asset_type,
    h.quantity,
    h.avgCost.toFixed(2),
    h.currentPrice.toFixed(2),
    h.marketValue.toFixed(2),
    h.unrealizedPnl.toFixed(2),
    h.unrealizedPnlPercent.toFixed(2),
  ])

  downloadCsv(
    `holdings-${new Date().toISOString().split('T')[0]}.csv`,
    toCsv(headers, rows)
  )
}
