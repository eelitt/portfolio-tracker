'use client'

import { useEffect, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import SensitiveValue from '@/components/SensitiveValue'
import { formatCurrency, formatQuantity } from '@/lib/currency'
import { perpUnrealizedPercent, type PerpHeadlineTerm } from '@/lib/convertToPreferred'
import type { PreferredCurrency } from '@/lib/userTypes'
import { HoldingCardLogo } from '../holdings/HoldingCardLogo'
import { useDashboardLayout } from '../DashboardLayoutProvider'

function money(amount: number, currency: PreferredCurrency): string {
  return formatCurrency(amount, currency, 1)
}

function formatLeverage(leverage: number | null): string {
  if (leverage == null || !Number.isFinite(leverage)) return '—'
  const rounded = Math.round(leverage * 100) / 100
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return `${text}×`
}

function signedClass(amount: number): string {
  return amount >= 0 ? 'text-pnl-positive' : 'text-pnl-negative'
}

function Row({
  label,
  caption,
  children,
}: {
  label: string
  caption?: string
  children: ReactNode
}) {
  return (
    <div className="flex justify-between gap-3">
      <span>
        {label}
        {caption ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{caption}</span>
        ) : null}
      </span>
      <span className="text-right">{children}</span>
    </div>
  )
}

export function PerpPresence({ available }: { available: boolean }) {
  const { setPerpsAvailable } = useDashboardLayout()
  useEffect(() => {
    setPerpsAvailable(available)
  }, [available, setPerpsAvailable])
  return null
}

export default function PerpCard({
  perp,
  preferredCurrency,
}: {
  perp: PerpHeadlineTerm
  preferredCurrency: PreferredCurrency
}) {
  const sideLabel = perp.positionSide === 'long' ? 'Long' : 'Short'
  const percent = perpUnrealizedPercent(perp.unrealized, perp.margin)
  const showFunding = Math.abs(perp.fundingNet) >= 0.005
  const showFees = Math.abs(perp.feeNet) >= 0.005

  const openAdd = () => {
    window.dispatchEvent(
      new CustomEvent('add-transaction', {
        detail: {
          asset_type: 'future',
          symbol: perp.symbol,
          position_side: perp.positionSide,
          action: perp.positionSide === 'long' ? 'sell' : 'buy',
        },
      })
    )
  }

  return (
    <button
      type="button"
      onClick={openAdd}
      className="group h-full w-full rounded-xl text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background active:scale-[0.985]"
      aria-label={`Add transaction for ${perp.symbol} ${perp.positionSide}`}
    >
      <Card className="relative h-full overflow-hidden border-subtle bg-surface-elevated transition-colors duration-200 group-hover:border-gold">
        <HoldingCardLogo symbol={perp.symbol} assetType="crypto" />
        <CardContent className="relative z-10 space-y-1 p-4 text-sm">
          <div className="mb-3">
            <div className="text-lg font-semibold">{perp.symbol}</div>
            <div className="text-sm text-muted-foreground">{sideLabel}</div>
          </div>
          <Row label="Equity">
            <SensitiveValue value={money(perp.equity, preferredCurrency)} />
          </Row>
          <Row label="Unrealized P&L">
            {perp.unrealized == null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className={signedClass(perp.unrealized)}>
                <SensitiveValue value={money(perp.unrealized, preferredCurrency)} />
                {percent !== undefined && (
                  <>
                    {' '}
                    (
                    <SensitiveValue value={`${percent.toFixed(1)}%`} />)
                  </>
                )}
              </span>
            )}
          </Row>
          <Row label="24h">
            {perp.dayChange == null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className={signedClass(perp.dayChange)}>
                <SensitiveValue value={money(perp.dayChange, preferredCurrency)} />
              </span>
            )}
          </Row>
          <Row label="Margin">
            <SensitiveValue value={money(perp.margin, preferredCurrency)} />
          </Row>
          {showFunding && (
            <Row label="Funding">
              <span className={signedClass(perp.fundingNet)}>
                <SensitiveValue value={money(perp.fundingNet, preferredCurrency)} />
              </span>
            </Row>
          )}
          {showFees && (
            <Row label="Fees">
              <span className={signedClass(perp.feeNet)}>
                <SensitiveValue value={money(perp.feeNet, preferredCurrency)} />
              </span>
            </Row>
          )}
          <Row label="Leverage">
            <span>{formatLeverage(perp.leverage)}</span>
          </Row>
          <Row label="Available margin" caption="Usable margin">
            {perp.availableMargin == null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <SensitiveValue value={money(perp.availableMargin, preferredCurrency)} />
            )}
          </Row>
          <Row label="Quantity">
            <SensitiveValue
              value={formatQuantity(perp.quantity, preferredCurrency, {
                symbol: perp.symbol,
              })}
            />
          </Row>
          <Row label="Entry">
            <SensitiveValue value={money(perp.entry, preferredCurrency)} />
          </Row>
          <Row label="Mark">
            {perp.mark == null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <SensitiveValue value={money(perp.mark, preferredCurrency)} />
            )}
          </Row>
          <Row label="Notional" caption="Not in portfolio total">
            {perp.notional == null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <SensitiveValue value={money(perp.notional, preferredCurrency)} />
            )}
          </Row>
        </CardContent>
      </Card>
    </button>
  )
}