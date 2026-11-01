import type { PositionSide } from './types'

/**
 * Perp book. One reduce for open sides, the cash those rows move, and the
 * realized P&L on a reduce. No I/O. Formulas live in docs/ai_docs/perp_calc_logic.md.
 *
 * Cash events passed in are already in USD. This function does not convert FX
 * and does not insert an Available Cash row.
 */

export type PerpAction =
  | 'buy'
  | 'sell'
  | 'funding'
  | 'fee'
  | 'margin_add'
  | 'margin_remove'

export type PerpRow = {
  id?: string
  symbol: string
  action: PerpAction
  position_side: PositionSide
  quantity?: number | null
  unit_price?: number | null
  amount?: number | null
  executed_at: string
  created_at?: string | null
}

const PERP_ACTIONS = new Set<string>([
  'buy',
  'sell',
  'funding',
  'fee',
  'margin_add',
  'margin_remove',
])

type LedgerPerpSource = {
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
}

/** Future rows only. A row without a side or a future action is left out. */
export function ledgerPerpRows(transactions: readonly LedgerPerpSource[]): PerpRow[] {
  const rows: PerpRow[] = []
  for (const tx of transactions || []) {
    if (tx.asset_type !== 'future') continue
    if (tx.position_side !== 'long' && tx.position_side !== 'short') continue
    if (!PERP_ACTIONS.has(tx.action)) continue
    rows.push({
      id: tx.id,
      symbol: tx.symbol,
      action: tx.action as PerpAction,
      position_side: tx.position_side,
      quantity: tx.quantity,
      unit_price: tx.unit_price,
      amount: tx.amount,
      executed_at: tx.executed_at,
      created_at: tx.created_at,
    })
  }
  return rows
}

export type CashEvent = {
  id?: string
  executed_at: string
  created_at?: string | null
  /** Signed USD. Inflow positive, outflow negative. */
  amount: number
}

export type PerpMark = {
  mark?: number | null
  previousMark?: number | null
}

export type OpenPerp = {
  symbol: string
  positionSide: PositionSide
  quantity: number
  entry: number
  margin: number
  assignedMargin: number
  fundingNet: number
  feeNet: number
}

export type PerpQuote = {
  notional: number | null
  leverage: number | null
  requiredMargin: number | null
  unrealized: number | null
  equity: number
  availableMargin: number | null
  /** What this side adds to portfolio value. */
  valueAdd: number
  unrealizedAdd: number
  dayAdd: number
}

export type PerpRowPnl =
  | { kind: 'none' }
  | { kind: 'realized'; realized: number; releasedMargin: number }

export type PerpBook = {
  positions: OpenPerp[]
  /** Cash events plus the future cash effect. USD. */
  cash: number
  /** Future rows only. USD. */
  futureCashDelta: number
  rowPnl: Map<string, PerpRowPnl>
}

export type PerpReject = {
  ok: false
  rowId: string
  reason: string
}

type SideState = {
  quantity: number
  entry: number
  margin: number
  assignedMargin: number
  fundingNet: number
  feeNet: number
}

type Timed = {
  executed_at: string
  created_at?: string | null
  id?: string
  kind: 'perp' | 'cash'
  row?: PerpRow
  cash?: number
}

const QTY = 8

function roundQty(n: number): number {
  return Number(n.toFixed(QTY))
}

function roundCash(n: number): number {
  return Number(n.toFixed(2))
}

function roundPx(n: number): number {
  return Number(n.toFixed(8))
}

function sideSign(side: PositionSide): 1 | -1 {
  return side === 'long' ? 1 : -1
}

function isFill(action: PerpAction): boolean {
  return action === 'buy' || action === 'sell'
}

function opens(action: PerpAction, side: PositionSide): boolean {
  return (side === 'long' && action === 'buy') || (side === 'short' && action === 'sell')
}

function reduces(action: PerpAction, side: PositionSide): boolean {
  return (side === 'long' && action === 'sell') || (side === 'short' && action === 'buy')
}

function keyOf(symbol: string, side: PositionSide): string {
  return `${symbol.trim().toUpperCase()}|${side}`
}

function compareTimed(a: Timed, b: Timed): number {
  const ta = new Date(a.executed_at).getTime()
  const tb = new Date(b.executed_at).getTime()
  if (ta !== tb) return ta - tb
  const aFee = a.row?.action === 'fee'
  const bFee = b.row?.action === 'fee'
  const aFill = a.row ? isFill(a.row.action) : false
  const bFill = b.row ? isFill(b.row.action) : false
  if (aFee && bFill) return 1
  if (bFee && aFill) return -1
  const ca = a.created_at ?? ''
  const cb = b.created_at ?? ''
  if (ca !== cb) return ca < cb ? -1 : 1
  return (a.id ?? '').localeCompare(b.id ?? '')
}

function positiveMark(mark: number | null | undefined): number | null {
  return typeof mark === 'number' && Number.isFinite(mark) && mark > 0 ? mark : null
}

export function quotePerp(position: OpenPerp, mark: PerpMark | undefined): PerpQuote {
  const side = sideSign(position.positionSide)
  const live = positiveMark(mark?.mark)
  const previous = positiveMark(mark?.previousMark)
  const assigned = position.assignedMargin
  const leverage = assigned > 0 ? (position.quantity * position.entry) / assigned : null

  if (live == null) {
    const equity = roundCash(position.margin + position.fundingNet + position.feeNet)
    return {
      notional: null,
      leverage,
      requiredMargin: null,
      unrealized: null,
      equity,
      availableMargin: null,
      valueAdd: equity,
      unrealizedAdd: 0,
      dayAdd: 0,
    }
  }

  const notional = position.quantity * live
  const requiredMargin = leverage != null && leverage > 0 ? notional / leverage : null
  const unrealized = (live - position.entry) * position.quantity * side
  const equity = position.margin + position.fundingNet + position.feeNet + unrealized
  const availableMargin = requiredMargin == null ? null : equity - requiredMargin
  const dayAdd =
    previous == null ? 0 : (live - previous) * position.quantity * side

  return {
    notional,
    leverage,
    requiredMargin,
    unrealized,
    equity,
    availableMargin,
    valueAdd: equity,
    unrealizedAdd: unrealized,
    dayAdd,
  }
}

/** A 1000-unit contract is not the price of one catalog unit. */
export function usableUsdMPair(pair: string | null | undefined): string | null {
  if (!pair) return null
  const upper = pair.trim().toUpperCase()
  if (!upper.endsWith('USDT')) return null
  if (upper.startsWith('1000')) return null
  return upper
}

export function holdingSnapshotKey(input: {
  userId: string
  snapshotDate: string
  symbol: string
  assetType: string
  positionSide: PositionSide | ''
}): string {
  return [
    input.userId,
    input.snapshotDate,
    input.symbol.trim().toUpperCase(),
    input.assetType,
    input.positionSide,
  ].join('|')
}

function blank(row: PerpRow): PerpRowPnl {
  return { kind: 'none' }
}

function reject(row: PerpRow, reason: string): PerpReject {
  const id = row.id ?? ''
  return {
    ok: false,
    rowId: id,
    reason: `${row.symbol.toUpperCase()} ${row.position_side} (${id}): ${reason}`,
  }
}

function applyRow(
  row: PerpRow,
  states: Map<string, SideState>,
  marks: Record<string, PerpMark> | undefined,
  checkCash: boolean,
  runningCash: number
): { ok: true; cashDelta: number; pnl: PerpRowPnl } | PerpReject {
  const symbol = row.symbol.trim().toUpperCase()
  const side = row.position_side
  const k = keyOf(symbol, side)
  const state = states.get(k)
  const open = state != null && state.quantity > 0
  const qty = Number(row.quantity)
  const price = Number(row.unit_price)
  const amount = row.amount == null ? null : Number(row.amount)

  if (row.action === 'funding' || row.action === 'fee' || row.action === 'margin_add' || row.action === 'margin_remove') {
    if (!open || !state) return reject(row, 'that side is not open')
    if (amount == null || !Number.isFinite(amount) || amount === 0) {
      return reject(row, 'amount is required')
    }
    if (row.action === 'funding') {
      state.fundingNet = roundCash(state.fundingNet + amount)
      return { ok: true, cashDelta: 0, pnl: blank(row) }
    }
    if (row.action === 'fee') {
      state.feeNet = roundCash(state.feeNet + amount)
      return { ok: true, cashDelta: 0, pnl: blank(row) }
    }
    if (row.action === 'margin_add') {
      if (!(amount > 0)) return reject(row, 'margin must be greater than 0')
      if (checkCash && runningCash + 1e-9 < amount) {
        return reject(row, 'available cash is smaller than the margin')
      }
      state.margin = roundCash(state.margin + amount)
      state.assignedMargin = roundCash(state.assignedMargin + amount)
      return { ok: true, cashDelta: roundCash(-amount), pnl: blank(row) }
    }
    if (!(amount > 0)) return reject(row, 'margin must be greater than 0')
    const quoted = quotePerp(
      {
        symbol,
        positionSide: side,
        quantity: state.quantity,
        entry: state.entry,
        margin: state.margin,
        assignedMargin: state.assignedMargin,
        fundingNet: state.fundingNet,
        feeNet: state.feeNet,
      },
      marks?.[symbol]
    )
    const available = quoted.availableMargin
    if (available == null || !(available > 0) || amount > available + 1e-9) {
      return reject(row, 'removal is larger than available margin')
    }
    state.margin = roundCash(state.margin - amount)
    return { ok: true, cashDelta: roundCash(amount), pnl: blank(row) }
  }

  if (!isFill(row.action)) return reject(row, 'unknown action')
  if (!(qty > 0) || !(price > 0)) return reject(row, 'quantity and price are required')

  if (opens(row.action, side)) {
    const posted = amount == null ? 0 : amount
    if (!open) {
      if (!(posted > 0)) return reject(row, 'margin is required to open')
      if (checkCash && runningCash + 1e-9 < posted) {
        return reject(row, 'available cash is smaller than the margin')
      }
      states.set(k, {
        quantity: roundQty(qty),
        entry: roundPx(price),
        margin: roundCash(posted),
        assignedMargin: roundCash(posted),
        fundingNet: 0,
        feeNet: 0,
      })
      return { ok: true, cashDelta: roundCash(-posted), pnl: blank(row) }
    }
    if (posted < 0) return reject(row, 'margin cannot be negative')
    if (checkCash && posted > 0 && runningCash + 1e-9 < posted) {
      return reject(row, 'available cash is smaller than the margin')
    }
    const nextQty = state.quantity + qty
    state.entry = roundPx((state.quantity * state.entry + qty * price) / nextQty)
    state.quantity = roundQty(nextQty)
    state.margin = roundCash(state.margin + posted)
    state.assignedMargin = roundCash(state.assignedMargin + posted)
    return { ok: true, cashDelta: roundCash(-posted), pnl: blank(row) }
  }

  if (!reduces(row.action, side)) return reject(row, 'unknown action')
  if (!open || !state) return reject(row, 'that side is not open')
  if (qty > state.quantity + 1e-9) {
    return reject(row, 'reduce is larger than that side')
  }

  const fraction = qty / state.quantity
  const realized = (price - state.entry) * qty * sideSign(side)
  const releasedMargin = state.margin * fraction
  const releasedFunding = state.fundingNet * fraction
  const releasedFees = state.feeNet * fraction
  const releasedAssigned = state.assignedMargin * fraction
  const cashIn = releasedMargin + releasedFunding + releasedFees + realized

  state.quantity = roundQty(state.quantity - qty)
  state.margin = roundCash(state.margin - releasedMargin)
  state.assignedMargin = roundCash(state.assignedMargin - releasedAssigned)
  state.fundingNet = roundCash(state.fundingNet - releasedFunding)
  state.feeNet = roundCash(state.feeNet - releasedFees)
  if (!(state.quantity > 0)) states.delete(k)

  return {
    ok: true,
    cashDelta: roundCash(cashIn),
    pnl: {
      kind: 'realized',
      realized: roundCash(realized),
      releasedMargin: roundCash(releasedMargin),
    },
  }
}

function walk(
  input: {
    rows: PerpRow[]
    cash?: CashEvent[]
    marks?: Record<string, PerpMark>
  },
  checkLimits: boolean
): PerpBook | PerpReject {
  const events: Timed[] = []
  for (const row of input.rows || []) {
    events.push({
      executed_at: row.executed_at,
      created_at: row.created_at,
      id: row.id,
      kind: 'perp',
      row,
    })
  }
  for (const cash of input.cash || []) {
    events.push({
      executed_at: cash.executed_at,
      created_at: cash.created_at,
      id: cash.id,
      kind: 'cash',
      cash: Number(cash.amount),
    })
  }
  events.sort(compareTimed)

  const states = new Map<string, SideState>()
  const rowPnl = new Map<string, PerpRowPnl>()
  let cash = 0
  let futureCashDelta = 0

  for (const event of events) {
    if (event.kind === 'cash') {
      cash = roundCash(cash + (event.cash ?? 0))
      continue
    }
    const row = event.row!
    const applied = applyRow(row, states, input.marks, checkLimits, cash)
    if (!('ok' in applied) || applied.ok !== true) {
      if (checkLimits) return applied as PerpReject
      if (row.id) rowPnl.set(row.id, { kind: 'none' })
      continue
    }
    cash = roundCash(cash + applied.cashDelta)
    futureCashDelta = roundCash(futureCashDelta + applied.cashDelta)
    if (row.id) rowPnl.set(row.id, applied.pnl)
  }

  const positions: OpenPerp[] = []
  for (const [k, state] of states) {
    if (!(state.quantity > 0)) continue
    const [symbol, positionSide] = k.split('|') as [string, PositionSide]
    positions.push({
      symbol,
      positionSide,
      quantity: state.quantity,
      entry: state.entry,
      margin: state.margin,
      assignedMargin: state.assignedMargin,
      fundingNet: state.fundingNet,
      feeNet: state.feeNet,
    })
  }

  return { positions, cash, futureCashDelta, rowPnl }
}

/** Apply a valid book. Structural rejects are skipped and marked none. */
export function reducePerps(input: {
  rows: PerpRow[]
  cash?: CashEvent[]
  marks?: Record<string, PerpMark>
}): PerpBook {
  const result = walk(input, false)
  if ('ok' in result && result.ok === false) {
    return { positions: [], cash: 0, futureCashDelta: 0, rowPnl: new Map() }
  }
  return result as PerpBook
}

/**
 * Quantity of one side from rows that sort before this fill.
 * A new row passes a createdAt later than rows already saved at the same time.
 */
export function sideQuantityBefore(input: {
  rows: readonly PerpRow[]
  symbol: string
  positionSide: PositionSide
  executedAt: string
  createdAt?: string | null
  excludeId?: string
}): number {
  const probe: PerpRow = {
    id: input.excludeId ?? 'probe',
    symbol: input.symbol,
    action: 'buy',
    position_side: input.positionSide,
    quantity: 1,
    unit_price: 1,
    executed_at: input.executedAt,
    created_at: input.createdAt,
  }
  const probeTimed: Timed = {
    executed_at: probe.executed_at,
    created_at: probe.created_at,
    id: probe.id,
    kind: 'perp',
    row: probe,
  }
  const prior: PerpRow[] = []
  for (const row of input.rows) {
    if (input.excludeId && row.id === input.excludeId) continue
    const timed: Timed = {
      executed_at: row.executed_at,
      created_at: row.created_at,
      id: row.id,
      kind: 'perp',
      row,
    }
    if (compareTimed(timed, probeTimed) < 0) prior.push(row)
  }
  const book = reducePerps({ rows: prior })
  const symbol = input.symbol.trim().toUpperCase()
  const found = book.positions.find(
    (p) => p.symbol === symbol && p.positionSide === input.positionSide
  )
  return found?.quantity ?? 0
}

export type PerpFillIntent =
  | { kind: 'open' }
  | { kind: 'add' }
  | { kind: 'reduce'; quantity: number }
  | { kind: 'too-big'; quantity: number }

/** What a buy or sell does to the selected side. Save stays off when the order is too big. */
export function perpFillIntent(input: {
  rows: readonly PerpRow[]
  symbol: string
  positionSide: PositionSide
  action: 'buy' | 'sell'
  quantity: number
  executedAt: string
  createdAt?: string | null
  excludeId?: string
}): PerpFillIntent {
  const openQty = sideQuantityBefore(input)
  const grows = opens(input.action, input.positionSide)
  if (grows) return openQty > 0 ? { kind: 'add' } : { kind: 'open' }
  const qty = Number(input.quantity)
  if (Number.isFinite(qty) && qty > openQty + 1e-9) {
    return { kind: 'too-big', quantity: openQty }
  }
  return { kind: 'reduce', quantity: openQty }
}

/** Save check. The first reject names the row. Nothing in here writes. */
export function validatePerps(input: {
  rows: PerpRow[]
  cash?: CashEvent[]
  marks?: Record<string, PerpMark>
}): ({ ok: true } & PerpBook) | PerpReject {
  const result = walk(input, true)
  if ('ok' in result && result.ok === false) return result
  return { ok: true, ...(result as PerpBook) }
}
