'use client'

import { useState } from 'react'
import { deleteGoal } from '@/app/actions/goals'
import type { Horizon, MonthlyContribution } from '@/lib/allocationTargets'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { Goal } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { fundingWarning } from '@/lib/projections'
import type { AssumptionPack, InflowMonth, ReturnSlice } from '@/lib/projections'
import { GoalCard } from './GoalCard'
import { GoalFormDialog } from './GoalFormDialog'
import { GoalReturnDisclaimer } from './GoalReturnDisclaimer'

export default function GoalsPanel({
  goals,
  portfolioValue,
  preferredCurrency,
  returnSlices,
  assumptions,
  contributionBand,
  horizon,
  monthlyBuys,
  monthlyCash,
  inflowByMonth,
  onChanged,
}: {
  goals: Goal[]
  portfolioValue: number
  preferredCurrency: PreferredCurrency
  returnSlices: ReturnSlice[]
  assumptions: AssumptionPack
  contributionBand: MonthlyContribution | null
  horizon: Horizon | null
  monthlyBuys: number
  monthlyCash: number
  inflowByMonth: InflowMonth[]
  onChanged: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)

  const incomplete = goals.filter((g) => !g.is_completed)
  const warning = fundingWarning(
    incomplete.map((g) => ({
      assignedAmount: g.assigned_amount ?? null,
    })),
    portfolioValue
  )

  const handleDelete = async (id: string) => {
    const result = await deleteGoal(id)
    if (result?.error) toast.error(result.error)
    else {
      toast.success('Goal deleted')
      onChanged()
    }
  }

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <GoalReturnDisclaimer />
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          Add goal
        </Button>
      </div>

      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No goals yet. Add your first investing goal to track progress.
        </p>
      )}

      {warning === 'full_mv_overlap' && (
        <p className="mb-3 text-xs text-amber-500/90">
          Two or more open goals use the full portfolio. Set an assigned amount
          on each if they should not share the same book.
        </p>
      )}
      {warning === 'assigned_exceeds_book' && (
        <p className="mb-3 text-xs text-amber-500/90">
          Assigned amounts add up to more than current portfolio value.
        </p>
      )}

      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            portfolioValue={portfolioValue}
            preferredCurrency={preferredCurrency}
            returnSlices={returnSlices}
            assumptions={assumptions}
            monthlyBuys={monthlyBuys}
            monthlyCash={monthlyCash}
            inflowByMonth={inflowByMonth}
            showFullBookHint={incomplete.length > 1}
            onEdit={(g) => {
              setEditing(g)
              setDialogOpen(true)
            }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      <GoalFormDialog
        open={dialogOpen}
        goal={editing}
        contributionBand={contributionBand}
        horizon={horizon}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditing(null)
        }}
        onSaved={onChanged}
      />
    </>
  )
}
