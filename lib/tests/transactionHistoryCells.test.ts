import { describe, expect, it } from 'vitest'
import type { Transaction } from '../types'
import {
  applyFilters,
  applySort,
  formatPriceCell,
  formatQuantityCell,
  historyActionLabel,
  historySymbolLabel,
  type AugmentedTransaction,
} from '@/app/(app)/dashboard/transactions/transactionUtils'

function row(partial: Partial<Transaction> & Pick<Transaction, 'action'>): AugmentedTransaction {
  return {
    symbol: 'BTC',
    asset_type: 'future',
    quantity: null,
    unit_price: null,
    executed_at: '2026-01-02T00:00:00Z',
    currency: 'USD',
    position_side: 'long',
    amount: null,
    ...partial,
  }
}

describe('history cells', () => {
  it('names a future with its side and leaves a spot ticker alone', () => {
    expect(historySymbolLabel(row({ action: 'buy', position_side: 'long' }))).toBe('BTC long')
    expect(historySymbolLabel(row({ action: 'sell', position_side: 'short' }))).toBe('BTC short')
    expect(
      historySymbolLabel(row({ action: 'buy', asset_type: 'crypto', position_side: null }))
    ).toBe('BTC')
  })

  it('labels wallet actions in words', () => {
    expect(historyActionLabel('margin_add')).toBe('Add margin')
    expect(historyActionLabel('margin_remove')).toBe('Remove margin')
    expect(historyActionLabel('funding')).toBe('Funding')
    expect(historyActionLabel('fee')).toBe('Fee')
    expect(historyActionLabel('buy')).toBe('Buy')
  })

  it('shows quantity and price on a fill, and amount with a blank quantity on a wallet row', () => {
    const fill = row({
      action: 'sell',
      quantity: 0.1,
      unit_price: 101000,
      amount: null,
    })
    const funding = row({ action: 'funding', amount: -40 })
    const fee = row({ action: 'fee', amount: -5 })

    expect(formatQuantityCell(fill, 'USD', 1, 0.87)).toBe(0.1)
    expect(formatPriceCell(fill, 'USD', 1, 0.87)).toBe('$101 000,00')
    expect(formatQuantityCell(funding, 'USD', 1, 0.87)).toBe('')
    expect(formatPriceCell(funding, 'USD', 1, 0.87)).toBe('$-40,00')
    expect(formatQuantityCell(fee, 'EUR', 0.87, 0.87)).toBe('')
    expect(formatPriceCell(fee, 'EUR', 0.87, 0.87)).toBe('€-4,35')
  })

  it('finds and sorts a future by the name that includes the side', () => {
    const spot = row({
      action: 'buy',
      asset_type: 'crypto',
      symbol: 'BTC',
      position_side: null,
      quantity: 1,
      unit_price: 100,
    })
    const long = row({ action: 'buy', position_side: 'long', quantity: 0.2, unit_price: 100000 })
    const short = row({ action: 'sell', symbol: 'ETH', position_side: 'short', quantity: 1, unit_price: 3000 })
    const rows = [spot, short, long]
    expect(applyFilters(rows, {
      searchTerm: 'btc long',
      assetFilter: 'all',
      actionFilter: 'all',
      dateFrom: '',
      dateTo: '',
    })).toEqual([long])
    expect(applySort(rows, { sortColumn: 'symbol', sortDirection: 'asc' }).map(historySymbolLabel))
      .toEqual(['BTC', 'BTC long', 'ETH short'])
  })
})
