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
  const text = await (blob as Blob).text()
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
      'Date,Symbol,Type,Action,Quantity,Price,Total Value,Notes'
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
