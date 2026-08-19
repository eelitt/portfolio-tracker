'use client'

import { useEffect, useState } from 'react'
import { createGoal, updateGoal } from '@/app/actions/goals'
import type { Horizon, MonthlyContribution } from '@/lib/allocationTargets'
import type { Goal } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  seedMonthlyFromBand,
  suggestTargetDateFromHorizon,
} from '@/lib/projections'
import { saveErrorMessage } from './saveError'

export function GoalFormDialog({
  open,
  goal,
  contributionBand,
  horizon,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  goal: Goal | null
  contributionBand: MonthlyContribution | null
  horizon: Horizon | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const editing = goal
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)
  const [targetDate, setTargetDate] = useState('')
  const [plannedMonthly, setPlannedMonthly] = useState('')
  const [assignedAmount, setAssignedAmount] = useState('')
  const [includeCash, setIncludeCash] = useState(true)

  useEffect(() => {
    if (!open) return
    if (goal) {
      setName(goal.name)
      setTarget(goal.target_amount.toString())
      setNotes(goal.notes || '')
      setIsCompleted(goal.is_completed || false)
      setTargetDate(goal.target_date ? goal.target_date.slice(0, 10) : '')
      setPlannedMonthly(
        goal.planned_monthly == null ? '' : String(goal.planned_monthly)
      )
      setAssignedAmount(
        goal.assigned_amount == null ? '' : String(goal.assigned_amount)
      )
      setIncludeCash(goal.include_cash !== false)
      return
    }
    setName('')
    setTarget('')
    setNotes('')
    setIsCompleted(false)
    setTargetDate(suggestTargetDateFromHorizon(horizon) ?? '')
    const seed = seedMonthlyFromBand(contributionBand)
    setPlannedMonthly(seed == null ? '' : String(seed))
    setAssignedAmount('')
    setIncludeCash(true)
  }, [open, goal, contributionBand, horizon])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.set('name', name)
    formData.set('target_amount', target)
    formData.set('notes', notes)
    formData.set('is_completed', isCompleted ? 'true' : 'false')
    formData.set('target_date', targetDate)
    formData.set('planned_monthly', plannedMonthly)
    formData.set('assigned_amount', assignedAmount)
    formData.set('include_cash', includeCash ? 'true' : 'false')

    const result = editing
      ? await updateGoal(editing.id, formData)
      : await createGoal(null as never, formData)

    if (result?.error) {
      toast.error(saveErrorMessage(result.error))
      return
    }
    toast.success(editing ? 'Goal updated' : 'Goal added')
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Goal' : 'New Investing Goal'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Retirement)"
            className="w-full rounded border p-2"
            required
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            type="number"
            step="any"
            placeholder="Target amount"
            className="w-full rounded border p-2"
            required
          />
          <label className="block text-xs text-muted-foreground">
            Target date
            <input
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              type="date"
              className="mt-1 w-full rounded border p-2 text-sm text-foreground"
            />
          </label>
          <input
            value={plannedMonthly}
            onChange={(e) => setPlannedMonthly(e.target.value)}
            type="number"
            step="any"
            min={0}
            placeholder="Planned monthly"
            className="w-full rounded border p-2"
          />
          <input
            value={assignedAmount}
            onChange={(e) => setAssignedAmount(e.target.value)}
            type="number"
            step="any"
            min={0}
            placeholder="Assigned amount (empty = full portfolio)"
            className="w-full rounded border p-2"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeCash}
              onChange={(e) => setIncludeCash(e.target.checked)}
            />
            Include cash (off = emergency / parked cash stays out)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="h-16 w-full rounded border p-2"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(e) => setIsCompleted(e.target.checked)}
            />
            Mark as completed
          </label>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              {editing ? 'Save Changes' : 'Add Goal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
