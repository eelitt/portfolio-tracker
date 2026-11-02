import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportHoldingsToCsv, exportTransactionsToCsv } from '../exportToCsv'

async function captureDownload(run: () => void): Promise<{ filename: string; text: string }> {
  let blob: Blob | null = null
  let filename = ''

  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation((obj: Blob | MediaSource) => {
      blob = obj as Blob
      return 'blob:mock'
    })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const el = realCreate(tag, options)
    if (tag.toLowerCase() === 'a') {
      el.click = () => {
        filename = (el as HTMLAnchorElement).download
      }
    }
    return el
  })

  run()

  expect(blob).not.toBeNull()
  const text = await (blob as unknown as Blob).text()
  createObjectURL.mockRestore()
  return { filename, text }
}

describe('exportTransactionsToCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('alerts and does not download when empty', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    exportTransactionsToCsv([])
    expect(alertSpy).toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('writes header, date, and quantity * price total', async () => {
    const { filename, text } = await captureDownload(() =>
      exportTransactionsToCsv([
        {
          symbol: 'AAPL',
          asset_type: 'stock',
          action: 'buy',
          quantity: 10,
          unit_price: 150,
          executed_at: '2025-03-15T12:00:00.000Z',
          notes: '',
        },
      ])
    )
    expect(filename).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.csv$/)
    const [header, row] = text.split('\n')
    expect(header).toBe(
      'Date,Symbol,Type,Side,Action,Quantity,Price,Amount,Total Value,Notes'
    )
    expect(row).toContain('2025-03-15')
    expect(row).toContain('AAPL')
    expect(row).toContain('1500.00')
  })

  it('neutralizes formula-like notes and escapes quotes/commas', async () => {
    const { text } = await captureDownload(() =>
      exportTransactionsToCsv([
        {
          symbol: 'AAPL',
          asset_type: 'stock',
          action: 'buy',
          quantity: 1,
          unit_price: 1,
          executed_at: '2025-01-01T00:00:00.000Z',
          notes: '=HYPERLINK("http://evil"), extra',
        },
      ])
    )
    expect(text).toContain("'=HYPERLINK")
    expect(text).toContain('""http://evil""')
    expect(text).toMatch(/"'=HYPERLINK/)
  })

  it('writes a future as its own ledger row', async () => {
    const { text } = await captureDownload(() =>
      exportTransactionsToCsv([
        {
          symbol: 'BTC',
          asset_type: 'future',
          position_side: 'long',
          action: 'buy',
          quantity: 0.1,
          unit_price: 100000,
          amount: 500,
          executed_at: '2026-04-01T15:30:00.000Z',
          notes: '',
        },
        {
          symbol: 'BTC',
          asset_type: 'future',
          position_side: 'long',
          action: 'fee',
          quantity: null,
          unit_price: null,
          amount: -2.5,
          executed_at: '2026-04-01T15:31:00.000Z',
          notes: '',
        },
      ])
    )
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).not.toContain('Realized')
    expect(text).not.toContain('Available Cash')
    const open = lines[1].split(',')
    expect(open[2]).toBe('future')
    expect(open[3]).toBe('long')
    expect(open[4]).toBe('buy')
    expect(open[7]).toBe('500.00')
    expect(open[8]).toBe('')
    const fee = lines[2].split(',')
    expect(fee[4]).toBe('fee')
    expect(fee[5]).toBe('')
    expect(fee[6]).toBe('')
    expect(fee[7]).toBe("'-2.50")
    expect(text).not.toContain('NaN')
  })
})

describe('exportHoldingsToCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('alerts when empty', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    exportHoldingsToCsv([])
    expect(alertSpy).toHaveBeenCalled()
  })

  it('includes market value and unrealized columns', async () => {
    const { filename, text } = await captureDownload(() =>
      exportHoldingsToCsv([
        {
          symbol: 'AAPL',
          asset_type: 'stock',
          quantity: 10,
          avgCost: 150,
          currentPrice: 180,
          marketValue: 1800,
          unrealizedPnl: 300,
          unrealizedPnlPercent: 20,
        },
      ])
    )
    expect(filename).toMatch(/^holdings-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(text).toContain('Market Value')
    expect(text).toContain('Unrealized P&L')
    expect(text).toContain('1800.00')
    expect(text).toContain('300.00')
  })
})
