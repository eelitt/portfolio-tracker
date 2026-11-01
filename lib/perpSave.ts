import { getAmountInUsd } from './currency'
import { ledgerPerpRows, type CashEvent, type PerpRow } from './perps'
import type { PositionSide } from './types'

/**
 * The ledger a create, update, or delete would leave, plus the USD cash
 * events validatePerps reads. Cash events are already USD. This does not
 * write a row and does not invent a second cash total.
 */

export type SaveRow = {
  id?: string
  symbol: string
  asset_type: string
  action: string
  position_side?: PositionSide | null
  quantity?: number | null
  unit_price?: number | null
  amount?: number | null
  executed_at: string
  created_at?: string | null
  currency?: string | null
}

export type SaveChange =
  | { kind: 'create'; row: SaveRow }
  | { kind: 'update'; id: string; row: SaveRow }
  | { kind: 'delete'; id: string }

function stamp(row: SaveRow, nowIso: string): SaveRow {
  return {
    ...row,
    id: row.id || 'new',
    created_at: row.created_at ?? nowIso,
    symbol: row.symbol.trim().toUpperCase(),
  }
}

/** A spot sell still adds its proceeds row. A future sell does not. */
function withSpotProceeds(rows: SaveRow[], created: SaveRow, nowIso: string): SaveRow[] {
  if (created.action !== 'sell') return rows
  if (created.asset_type === 'cash' || created.asset_type === 'future') return rows
  const qty = Number(created.quantity)
  const px = Number(created.unit_price)
  if (!Number.isFinite(qty) || !Number.isFinite(px)) return rows
  const proceeds = Number((qty * px).toFixed(2))
  if (!(proceeds > 0)) return rows
  return [
    ...rows,
    {
      id: `proceeds:${created.id ?? 'new'}`,
      symbol: 'Available Cash',
      asset_type: 'cash',
      action: 'inflow',
      quantity: proceeds,
      unit_price: 1,
      executed_at: created.executed_at,
      created_at: created.created_at ?? nowIso,
      currency: created.currency === 'EUR' ? 'EUR' : 'USD',
    },
  ]
}

/** Rows that would remain after the save, including a spot sell's proceeds. */
export function ledgerAfterSave(
  existing: readonly SaveRow[],
  change: SaveChange,
  nowIso: string
): SaveRow[] {
  if (change.kind === 'delete') {
    return existing.filter((row) => row.id !== change.id)
  }
  if (change.kind === 'update') {
    const prior = existing.find((row) => row.id === change.id)
    const row = stamp(
      {
        ...change.row,
        id: change.id,
        created_at: change.row.created_at ?? prior?.created_at ?? null,
      },
      nowIso
    )
    const kept = existing.filter((item) => item.id !== change.id)
    return [...kept, row]
  }
  const row = stamp(change.row, nowIso)
  return withSpotProceeds([...existing, row], row, nowIso)
}

/** Signed USD notional of each cash row. Inflow and buy are positive. */
export function cashEventsInUsd(
  rows: readonly SaveRow[],
  usdToEurRate: number
): CashEvent[] {
  const rate = usdToEurRate > 0 ? usdToEurRate : 0.92
  const events: CashEvent[] = []
  for (const row of rows) {
    if (row.asset_type !== 'cash') continue
    const qty = Number(row.quantity)
    const px = Number(row.unit_price ?? 1)
    if (!Number.isFinite(qty) || !Number.isFinite(px)) continue
    const face = getAmountInUsd(qty * px, row.currency === 'EUR' ? 'EUR' : 'USD', rate)
    const sign = row.action === 'sell' || row.action === 'outflow' ? -1 : 1
    events.push({
      id: row.id,
      executed_at: row.executed_at,
      created_at: row.created_at,
      amount: Number((sign * face).toFixed(2)),
    })
  }
  return events
}

export function perpRowsAfterSave(
  existing: readonly SaveRow[],
  change: SaveChange,
  nowIso: string
): PerpRow[] {
  return ledgerPerpRows(ledgerAfterSave(existing, change, nowIso))
}
