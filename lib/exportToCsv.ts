/**
 * Client-side CSV export helpers.
 *
 * These run in the browser, build a Blob, and trigger a download.
 * They are intentionally simple (no server round-trip for exports).
 */

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

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`
  link.click()

  URL.revokeObjectURL(url)
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

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = `holdings-${new Date().toISOString().split('T')[0]}.csv`
  link.click()

  URL.revokeObjectURL(url)
}