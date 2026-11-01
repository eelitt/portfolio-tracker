'use client'

import { useEffect, useState } from 'react'
import { getUserTransactions } from '@/app/actions/transactions'
import { fieldClassName, labelClassName } from './formStyles'
import { ledgerPerpRows, perpFillIntent, type PerpFillIntent } from '@/lib/perps'
import type { PositionSide, Transaction, TransactionAction } from '@/lib/types'

export function toLocalInput(value: string, withTime: boolean): string {
  if (!withTime) return value.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString()
}

function fillLine(side: PositionSide, intent: PerpFillIntent): string {
  if (intent.kind === 'open') return `This order opens the ${side}.`
  if (intent.kind === 'add') return `This order adds to the ${side}.`
  if (intent.kind === 'reduce') return `This order reduces the ${side}.`
  return `This order is too big for the ${side}.`
}

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

interface FutureOrderFieldsProps {
  idPrefix: string
  symbol: string
  action: TransactionAction
  executedAt: string
  excludeId?: string
  createdAt?: string | null
  initialSide?: PositionSide
  initialQuantity?: number | null
  initialPrice?: number | null
  initialAmount?: number | null
  onBlockedChange: (blocked: boolean) => void
}

export default function FutureOrderFields({
  idPrefix,
  symbol,
  action,
  executedAt,
  excludeId,
  createdAt,
  initialSide = 'long',
  initialQuantity,
  initialPrice,
  initialAmount,
  onBlockedChange,
}: FutureOrderFieldsProps) {
  const [side, setSide] = useState<PositionSide>(initialSide)
  const [quantity, setQuantity] = useState(
    initialQuantity != null ? String(initialQuantity) : ''
  )
  const [unitPrice, setUnitPrice] = useState(
    initialPrice != null ? String(initialPrice) : ''
  )
  const [margin, setMargin] = useState(
    initialAmount != null && initialAmount > 0 ? String(initialAmount) : ''
  )
  const [walletAmount, setWalletAmount] = useState(() => {
    if (initialAmount == null) return ''
    return String(Math.abs(initialAmount))
  })
  const [fundingDirection, setFundingDirection] = useState<'received' | 'paid'>(
    initialAmount != null && initialAmount < 0 ? 'paid' : 'received'
  )
  const [ledger, setLedger] = useState<Transaction[]>([])
  const [sortCreatedAt] = useState(() => createdAt ?? new Date().toISOString())

  useEffect(() => {
    let cancelled = false
    getUserTransactions().then((rows) => {
      if (!cancelled) setLedger(rows as Transaction[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const fill =
    action === 'buy' || action === 'sell'
  const qty = Number(quantity)
  const price = Number(unitPrice)
  const intent = fill
    ? perpFillIntent({
        rows: ledgerPerpRows(ledger),
        symbol,
        positionSide: side,
        action,
        quantity: Number.isFinite(qty) ? qty : 0,
        executedAt: fromLocalInput(executedAt),
        createdAt: sortCreatedAt,
        excludeId,
      })
    : null
  const blocked = intent?.kind === 'too-big'
  const showMargin = intent?.kind === 'open' || intent?.kind === 'add'
  const notional =
    fill && Number.isFinite(qty) && qty > 0 && Number.isFinite(price) && price > 0
      ? qty * price
      : null

  useEffect(() => {
    onBlockedChange(blocked)
  }, [blocked, onBlockedChange])

  let amountValue = ''
  if (showMargin) amountValue = margin
  if (action === 'funding') {
    const n = Number(walletAmount)
    if (Number.isFinite(n) && n > 0) {
      amountValue = String(fundingDirection === 'paid' ? -n : n)
    }
  }
  if (action === 'fee') {
    const n = Number(walletAmount)
    if (Number.isFinite(n) && n > 0) amountValue = String(-n)
  }
  if (action === 'margin_add' || action === 'margin_remove') {
    amountValue = walletAmount
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-side`} className={labelClassName}>
          Position side
        </label>
        <select
          id={`${idPrefix}-side`}
          name="position_side"
          value={side}
          onChange={(e) => setSide(e.target.value as PositionSide)}
          className={fieldClassName}
          required
        >
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
      </div>

      {fill ? (
        <>
          {symbol.trim() && intent ? (
            <p className="text-sm text-muted-foreground" role="status">
              {fillLine(side, intent)}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${idPrefix}-quantity`} className={labelClassName}>
                Quantity
              </label>
              <input
                id={`${idPrefix}-quantity`}
                name="quantity"
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={fieldClassName}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${idPrefix}-price`} className={labelClassName}>
                Unit price ($)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  id={`${idPrefix}-price`}
                  name="unit_price"
                  type="number"
                  step="any"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className={`${fieldClassName} pl-8`}
                  required
                />
              </div>
            </div>
          </div>
          {showMargin ? (
            <div className="space-y-1.5">
              <label htmlFor={`${idPrefix}-margin`} className={labelClassName}>
                Margin (USD)
              </label>
              <input
                id={`${idPrefix}-margin`}
                type="number"
                step="any"
                min="0"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                className={fieldClassName}
                required={intent?.kind === 'open'}
              />
              <p className="text-sm text-muted-foreground">
                This amount leaves available cash.
                {intent?.kind === 'add' ? ' Leave it blank to post nothing.' : ''}
              </p>
            </div>
          ) : null}
          {notional != null ? (
            <p className="text-sm text-muted-foreground">
              Notional {money(notional)}. Not in portfolio total.
            </p>
          ) : null}
        </>
      ) : null}

      {action === 'funding' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-funding-dir`} className={labelClassName}>
              Funding
            </label>
            <select
              id={`${idPrefix}-funding-dir`}
              value={fundingDirection}
              onChange={(e) =>
                setFundingDirection(e.target.value as 'received' | 'paid')
              }
              className={fieldClassName}
            >
              <option value="received">Received</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${idPrefix}-funding`} className={labelClassName}>
              Amount (USD)
            </label>
            <input
              id={`${idPrefix}-funding`}
              type="number"
              step="any"
              min="0"
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              className={fieldClassName}
              required
            />
          </div>
        </div>
      ) : null}

      {action === 'fee' ? (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-fee`} className={labelClassName}>
            Amount paid (USD)
          </label>
          <input
            id={`${idPrefix}-fee`}
            type="number"
            step="any"
            min="0"
            value={walletAmount}
            onChange={(e) => setWalletAmount(e.target.value)}
            className={fieldClassName}
            required
          />
          <p className="text-sm text-muted-foreground">Stored as a negative amount.</p>
        </div>
      ) : null}

      {action === 'margin_add' || action === 'margin_remove' ? (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-wallet-margin`} className={labelClassName}>
            Amount (USD)
          </label>
          <input
            id={`${idPrefix}-wallet-margin`}
            type="number"
            step="any"
            min="0"
            value={walletAmount}
            onChange={(e) => setWalletAmount(e.target.value)}
            className={fieldClassName}
            required
          />
          {action === 'margin_add' ? (
            <p className="text-sm text-muted-foreground">
              This amount leaves available cash.
            </p>
          ) : null}
        </div>
      ) : null}

      <input type="hidden" name="amount" value={amountValue} />
    </div>
  )
}
