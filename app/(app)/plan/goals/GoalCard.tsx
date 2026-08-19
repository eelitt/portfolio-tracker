'use client'

import { useEffect, useRef, useState } from 'react'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { Goal } from '@/lib/types'
import { formatCurrency } from '@/lib/currency'
import SensitiveValue from '@/components/SensitiveValue'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2 } from 'lucide-react'
import type { AssumptionPack, InflowMonth, ReturnSlice } from '@/lib/projections'
import { formatFiDate, formatHitDate } from './goalFormat'

function reachedLabel(months: number | null): string {
  if (months == null) return 'never (at this return)'
  if (months <= 0) return 'already there'
  return formatHitDate(months) ?? '—'
}

function MoneyDate({
  value,
  date,
}: {
  value: string
  date: string
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      <span className="shrink-0">On target date {date}:</span>
      <SensitiveValue value={value} className="whitespace-nowrap tabular-nums" />
    </span>
  )
}
import { buildGoalCardModel } from './buildGoalCardModel'
import { statusChipClass, statusLabel } from './goalStatusUi'
import { GoalProjectionPopover } from './GoalProjectionPopover'

export function GoalCard({
  goal,
  portfolioValue,
  preferredCurrency,
  returnSlices,
  assumptions,
  monthlyBuys,
  monthlyCash,
  inflowByMonth,
  showFullBookHint,
  onEdit,
  onDelete,
}: {
  goal: Goal
  portfolioValue: number
  preferredCurrency: PreferredCurrency
  returnSlices: ReturnSlice[]
  assumptions: AssumptionPack
  monthlyBuys: number
  monthlyCash: number
  inflowByMonth: InflowMonth[]
  showFullBookHint: boolean
  onEdit: (goal: Goal) => void
  onDelete: (id: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const model = buildGoalCardModel({
    goal,
    portfolioValue,
    returnSlices,
    assumptions,
    monthlyBuys,
    monthlyCash,
    inflowByMonth,
  })
  const { includeCash, pv, actualMonthlyInflow, depositMonths, pct, proj } =
    model
  const isDone = goal.is_completed
  const open = !isDone && !!proj && (hover || pinned)
  const money = (n: number) => formatCurrency(n, preferredCurrency, 1)

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => setHover(false), 180)
  }

  useEffect(() => () => clearClose(), [])

  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [pinned])

  return (
    <div
      ref={rootRef}
      className={`rounded-lg border border-subtle bg-card p-3 transition-colors duration-200 hover:border-gold ${isDone ? 'opacity-60' : 'cursor-pointer'}`}
      onMouseEnter={() => {
        if (isDone) return
        clearClose()
        setHover(true)
      }}
      onMouseLeave={() => {
        if (!pinned) scheduleClose()
      }}
      onClick={() => {
        if (isDone || !proj) return
        setPinned((v) => !v)
      }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className={`font-medium ${isDone ? 'line-through' : ''}`}>
            {goal.name} {isDone && '✓'}
          </div>
          <div className="text-xs text-muted-foreground">
            <SensitiveValue value={money(pv)} />
            {' / '}
            <SensitiveValue value={money(goal.target_amount)} />
            {goal.assigned_amount == null && showFullBookHint && (
              <span> · full book</span>
            )}
            
          </div>
          <div className="text-xs text-muted-foreground">
{!includeCash && <span>cash excluded</span>}
          </div>
          {goal.target_date && (
            <div className="text-[11px] text-muted-foreground">
              Target {formatFiDate(goal.target_date)}
              {proj?.months != null ? ` · ${proj.months} mo left` : ''}
            </div>
          )}
          {goal.notes && (
            <div className="mt-1 text-xs italic text-muted-foreground">
              {goal.notes}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(goal)
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(goal.id)
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {!isDone && proj && (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded bg-muted">
            <div
              className="h-2 rounded bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusChipClass(proj.status)}`}
            >
              {statusLabel(proj.status)}
            </span>
            <span className="text-[10px] text-muted-foreground">{pct}%</span>
          </div>
          {proj.requiredMonthly === 0 && proj.months != null ? (
            <div className="mt-1 text-[11px] font-medium text-muted-foreground">
              No extra monthly cash needed to hit the deadline
            </div>
          ) : proj.requiredMonthly != null ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              To hit the deadline, need{' '}
              <SensitiveValue
                value={money(proj.requiredMonthly)}
                className="whitespace-nowrap tabular-nums"
              />
              /mo
            </div>
          ) : null}

          <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
            <div>
              <div className="font-medium text-foreground/80">If you add nothing</div>
              <div>
                Target reached:{' '}
                <span className="whitespace-nowrap">
                  {reachedLabel(model.hitMonthsGrowthOnly)}
                </span>
              </div>
              {goal.target_date && model.growthOnlyAtDate != null && (
                <div>
                  <MoneyDate
                    value={money(model.growthOnlyAtDate)}
                    date={formatFiDate(goal.target_date)}
                  />
                </div>
              )}
            </div>
            {proj.plannedMonthly != null && (
              <div>
                <div className="font-medium text-foreground/80">
                  If you add{' '}
                  <SensitiveValue
                    value={money(proj.plannedMonthly)}
                    className="whitespace-nowrap tabular-nums"
                  />
                  /mo
                </div>
                <div>
                  Target reached:{' '}
                  <span className="whitespace-nowrap">
                    {reachedLabel(proj.monthsToTarget)}
                  </span>
                </div>
                {goal.target_date && proj.projectedValue != null && (
                  <div>
                    <MoneyDate
                      value={money(proj.projectedValue)}
                      date={formatFiDate(goal.target_date)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 text-[11px] text-muted-foreground">
            Last 90 days, you added{' '}
            <SensitiveValue
              value={money(actualMonthlyInflow)}
              className="whitespace-nowrap tabular-nums"
            />
            /mo on average
            {proj.plannedMonthly != null && (
              <>
                {' '}
                (plan:{' '}
                <SensitiveValue
                  value={money(proj.plannedMonthly)}
                  className="whitespace-nowrap tabular-nums"
                />
                /mo)
              </>
            )}
          </div>
        </>
      )}
      {proj && (
        <GoalProjectionPopover
          open={open}
          anchor={rootRef.current}
          name={goal.name}
          targetDate={goal.target_date ?? null}
          assignedAmount={goal.assigned_amount ?? null}
          portfolioValue={portfolioValue}
          usesFullBook={goal.assigned_amount == null}
          projection={proj}
          returnSlices={model.slicesForReturn}
          assumptions={assumptions}
          preferredCurrency={preferredCurrency}
          actualMonthlyInflow={actualMonthlyInflow}
          inflowByMonth={depositMonths}
          onMouseEnter={() => {
            clearClose()
            setHover(true)
          }}
          onMouseLeave={() => {
            if (!pinned) scheduleClose()
          }}
        />
      )}
    </div>
  )
}
