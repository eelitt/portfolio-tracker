'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PreferredCurrency } from '@/lib/userTypes'
import { formatCurrency } from '@/lib/currency'
import SensitiveValue from '@/components/SensitiveValue'
import {
  FIXED_TYPE_RATES,
  RETURN_STRESS_PP,
  STABLE_RATE,
  evaluateGoal,
  isStableCrypto,
  keepContributingSurplus,
  type AssumptionPack,
  type GoalProjection,
  type InflowMonth,
  type ReturnSlice,
} from '@/lib/projections'
import { formatFiDate } from './goalFormat'
import { OnTargetDateValue, reachedLabel } from './goalCopy'

const PANEL_W = 320
const PAD = 8

function money(n: number, currency: PreferredCurrency) {
  return formatCurrency(n, currency, 1)
}

function pct(rate: number, digits = 1) {
  return `${(rate * 100).toFixed(digits)}%`
}

function statusWhy(
  proj: GoalProjection,
  currency: PreferredCurrency
): ReactNode {
  if (proj.status === 'incomplete') {
    const missing: string[] = []
    if (proj.months == null) missing.push('a target date')
    if (proj.plannedMonthly == null) missing.push('a planned monthly amount')
    return `Add ${missing.join(' and ')} to see if you are on track.`
  }
  if (proj.requiredMonthly == null || proj.plannedMonthly == null) {
    return 'Not enough inputs to compare planned vs required monthly.'
  }
  const gap = proj.plannedMonthly - proj.requiredMonthly
  if (proj.status === 'ahead') {
    return (
      <>
        Your planned monthly is{' '}
        <SensitiveValue value={money(gap, currency)} /> above what is required
        at the assumed return.
      </>
    )
  }
  if (proj.status === 'behind') {
    return (
      <>
        Your planned monthly is{' '}
        <SensitiveValue value={money(-gap, currency)} /> below what is required
        at the assumed return.
      </>
    )
  }
  return 'Planned monthly matches the required amount at the assumed return.'
}

export function GoalProjectionPopover({
  open,
  anchor,
  name,
  targetDate,
  assignedAmount,
  portfolioValue,
  usesFullBook,
  projection,
  returnSlices,
  assumptions,
  preferredCurrency,
  actualMonthlyInflow,
  inflowByMonth,
  onMouseEnter,
  onMouseLeave,
}: {
  open: boolean
  anchor: HTMLElement | null
  name: string
  targetDate: string | null
  assignedAmount: number | null
  portfolioValue: number
  usesFullBook: boolean
  projection: GoalProjection
  returnSlices: ReturnSlice[]
  assumptions: AssumptionPack
  preferredCurrency: PreferredCurrency
  actualMonthlyInflow: number
  inflowByMonth: InflowMonth[]
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const panel = panelRef.current
      const w = panel?.offsetWidth ?? PANEL_W
      const h = panel?.offsetHeight ?? 280
      let left = rect.left - w - PAD
      let top = rect.top
      if (left < PAD) {
        left = Math.min(
          Math.max(PAD, rect.left),
          window.innerWidth - w - PAD
        )
        top = rect.bottom + PAD
      }
      const maxTop = window.innerHeight - h - PAD
      top = Math.max(PAD, Math.min(top, maxTop))
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, projection.status])

  if (!mounted || !open) return null

  const c = preferredCurrency
  const cryptoHeld = [
    ...new Map(
      returnSlices
        .filter((s) => s.assetType === 'crypto' && s.marketValue > 0)
        .map((s) => [s.symbol.toUpperCase(), s])
    ).values(),
  ]
  const coinBySym = new Map(
    assumptions.coins.map((x) => [x.symbol.toUpperCase(), x])
  )
  const paths =
    projection.months != null
      ? keepContributingSurplus({
          pv: projection.pv,
          target: projection.target,
          annualRate: projection.annualRate,
          months: projection.months,
          plannedMonthly: projection.plannedMonthly ?? 0,
        })
      : null

  const stressed = evaluateGoal({
    pv: projection.pv,
    target: projection.target,
    annualRate: projection.annualRate - RETURN_STRESS_PP,
    months: projection.months,
    plannedMonthly: projection.plannedMonthly,
  })
  const stressLine =
    projection.months == null ? null : stressed.requiredMonthly != null &&
      projection.requiredMonthly != null &&
      stressed.requiredMonthly > projection.requiredMonthly + 0.009 ? (
      <div>
        If return is {pct(RETURN_STRESS_PP, 0)} worse, required is{' '}
        <SensitiveValue value={`${money(stressed.requiredMonthly, c)}/mo`} />
        {stressed.monthsToTarget != null &&
        projection.months != null &&
        stressed.monthsToTarget > projection.months
          ? ` — you miss the date by ${stressed.monthsToTarget - projection.months} months at this planned amount`
          : ''}
        .
      </div>
    ) : stressed.monthsToTarget != null &&
      projection.months != null &&
      stressed.monthsToTarget > projection.months ? (
      <div>
        If return is {pct(RETURN_STRESS_PP, 0)} worse, you miss the date by{' '}
        {stressed.monthsToTarget - projection.months} months at this planned
        amount.
      </div>
    ) : (
      <div>
        If return is {pct(RETURN_STRESS_PP, 0)} worse, you still reach the
        target on this plan.
      </div>
    )

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${name} projection`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ top: pos.top, left: pos.left }}
      className="panel-scroll fixed z-[80] w-[min(20rem,calc(100vw-1.5rem))] max-h-[min(28rem,75vh)] overflow-y-auto rounded-lg border border-subtle bg-card p-3 text-xs shadow-xl"
    >
      <div className="text-sm font-medium text-foreground">{name}</div>
      <p className="mt-1 leading-snug text-muted-foreground">
        {statusWhy(projection, c)}
      </p>

      <div className="mt-3 space-y-1 border-t border-subtle pt-2 text-muted-foreground">
        <div className="font-medium text-foreground">Inputs</div>
        <div>
          Starting value:{' '}
          <SensitiveValue value={money(projection.pv, c)} />
          {usesFullBook
            ? ' (full portfolio)'
            : assignedAmount != null
              ? ` (assigned of ${money(portfolioValue, c)} book)`
              : null}
        </div>
        <div>
          Target: <SensitiveValue value={money(projection.target, c)} />
        </div>
        <div>
          Date:{' '}
          {targetDate
            ? `${formatFiDate(targetDate)}${projection.months != null ? ` · ${projection.months} months left` : ''}`
            : 'not set'}
        </div>
        <div>
          Planned monthly:{' '}
          {projection.plannedMonthly == null ? (
            'not set'
          ) : (
            <SensitiveValue value={`${money(projection.plannedMonthly, c)}/mo`} />
          )}
        </div>
        <div>
          Last 90d deposits:{' '}
          <SensitiveValue value={`${money(actualMonthlyInflow, c)}/mo`} /> avg
        </div>
        {inflowByMonth.map((row) => (
          <div key={row.key} className="pl-2">
            {row.label}: <SensitiveValue value={money(row.amount, c)} />
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1 border-t border-subtle pt-2 text-muted-foreground">
        <div className="font-medium text-foreground">Assumed return</div>
        <div>
          Blended {pct(projection.annualRate, 1)} / year nominal. Stock/etf{' '}
          {pct(FIXED_TYPE_RATES.stock, 0)}, cash {pct(FIXED_TYPE_RATES.cash, 0)},
          stables {pct(STABLE_RATE, 0)}. Not Allocation targets. Not a forecast.
        </div>
        {cryptoHeld.map((s) => {
          const sym = s.symbol.toUpperCase()
          if (isStableCrypto(sym)) {
            return (
              <div key={sym}>
                {sym}: {pct(STABLE_RATE, 0)} (stable)
              </div>
            )
          }
          const coin = coinBySym.get(sym)
          if (coin?.status === 'used' && coin.planningRate != null) {
            const win =
              coin.windowStart && coin.windowEnd
                ? ` · ${formatFiDate(coin.windowStart)}–${formatFiDate(coin.windowEnd)}`
                : ''
            return (
              <div key={sym}>
                {sym}: {pct(coin.planningRate, 0)}
                {win}
                {coin.rawCagr != null ? ` (historic ${pct(coin.rawCagr, 0)}, −2pp)` : ''}
              </div>
            )
          }
          if (coin?.status === 'short_history') {
            return (
              <div key={sym}>
                {sym}: &lt;5y history, using BTC {pct(assumptions.fallbackCrypto, 0)}
              </div>
            )
          }
          return (
            <div key={sym}>
              {sym}: no Yahoo series, using BTC {pct(assumptions.fallbackCrypto, 0)}
            </div>
          )
        })}
      </div>

      <div className="mt-3 space-y-1 border-t border-subtle pt-2 text-muted-foreground">
        <div className="font-medium text-foreground">Result</div>
        {paths && (
          <div className="space-y-2">
            <div>
              <div className="font-medium text-foreground/80">If you add nothing</div>
              <div>
                Target reached:{' '}
                <span className="whitespace-nowrap">
                  {reachedLabel(paths.monthsGrowthOnly)}
                </span>
              </div>
              {targetDate && (
                <div>
                  <OnTargetDateValue
                    value={money(paths.growthOnlyAtDate, c)}
                    dateIso={targetDate}
                  />
                </div>
              )}
            </div>
            {projection.plannedMonthly != null && (
              <div>
                <div className="font-medium text-foreground/80">
                  If you add{' '}
                  <SensitiveValue
                    value={`${money(projection.plannedMonthly, c)}/mo`}
                    className="whitespace-nowrap tabular-nums"
                  />
                  /mo
                </div>
                <div>
                  Target reached:{' '}
                  <span className="whitespace-nowrap">
                    {reachedLabel(paths.monthsWithPlanned)}
                  </span>
                </div>
                {targetDate && (
                  <div>
                    <OnTargetDateValue
                      value={money(paths.withPlannedAtDate, c)}
                      dateIso={targetDate}
                    />
                  </div>
                )}
                {paths.surplusAtDate > 0.009 && (
                  <div>
                    <SensitiveValue
                      value={money(paths.surplusAtDate, c)}
                      className="whitespace-nowrap tabular-nums"
                    />{' '}
                    over the target on that deadline
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {projection.requiredMonthly != null && (
          <div>
            {projection.requiredMonthly === 0
              ? 'Minimum to hit the date: no new cash. The planned line above is extra.'
              : (
                <>
                  Minimum to hit the date:{' '}
                  <SensitiveValue
                    value={`${money(projection.requiredMonthly, c)}/mo`}
                  />
                </>
              )}
          </div>
        )}
        {stressLine}
        {projection.plannedMonthly != null &&
          projection.monthsToTarget == null &&
          projection.pv < projection.target && (
            <div>This planned amount never reaches the target at the assumed return.</div>
          )}
      </div>

      <div className="mt-3 space-y-1 border-t border-subtle pt-2 text-muted-foreground">
        <div className="font-medium text-foreground">How it is calculated</div>
        <div>
          Required monthly is the contribution that reaches the target if the
          starting value grows at that yearly rate, compounded monthly.
        </div>
        <div>
          Projected value grows the starting amount for those months and adds
          each planned contribution at month-end. Surplus is planned
          contributions after the target is already covered.
        </div>
      </div>
    </div>,
    document.body
  )
}
