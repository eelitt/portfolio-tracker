'use client'

import { useState } from 'react'
import {
  createGoal,
  updateGoal,
  deleteGoal,
} from '@/app/actions/goals'
import type { PreferredCurrency } from '@/lib/userTypes'
import { formatCurrency } from '@/lib/currency'
import SensitiveValue from '@/components/SensitiveValue'
import { Goal } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export default function GoalsPanel({
  goals,
  portfolioValue,
  preferredCurrency,
  onChanged,
}: {
  goals: Goal[]
  portfolioValue: number
  preferredCurrency: PreferredCurrency
  onChanged: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)

  const openAdd = () => {
    setEditing(null)
    setName('')
    setTarget('')
    setNotes('')
    setIsCompleted(false)
    setDialogOpen(true)
  }

  const openEdit = (goal: Goal) => {
    setEditing(goal)
    setName(goal.name)
    setTarget(goal.target_amount.toString())
    setNotes(goal.notes || '')
    setIsCompleted(goal.is_completed || false)
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.set('name', name)
    formData.set('target_amount', target)
    formData.set('notes', notes)
    formData.set('is_completed', isCompleted ? 'true' : 'false')

    const result = editing
      ? await updateGoal(editing.id, formData)
      : await createGoal(null as never, formData)

    if (result?.error) {
      const msg = typeof result.error === 'string' ? result.error : 'Failed to save goal'
      toast.error(msg)
    } else {
      toast.success(editing ? 'Goal updated' : 'Goal added')
      setDialogOpen(false)
      setEditing(null)
      onChanged()
    }
  }

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
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={openAdd}>
          Add goal
        </Button>
      </div>

      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No goals yet. Add your first investing goal to track progress.
        </p>
      )}

      <div className="space-y-3">
        {goals.map((goal) => {
          const pct =
            goal.target_amount > 0
              ? Math.min(100, Math.round((portfolioValue / goal.target_amount) * 100))
              : 0
          const isDone = goal.is_completed
          return (
            <div
              key={goal.id}
              className={`rounded-lg border border-subtle bg-card p-3 transition-colors duration-200 hover:border-gold ${isDone ? 'opacity-60' : ''}`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className={`font-medium ${isDone ? 'line-through' : ''}`}>
                    {goal.name} {isDone && '✓'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <SensitiveValue
                      value={formatCurrency(portfolioValue, preferredCurrency, 1)}
                    />{' '}
                    /{' '}
                    <SensitiveValue
                      value={formatCurrency(goal.target_amount, preferredCurrency, 1)}
                    />
                  </div>
                  {goal.notes && (
                    <div className="mt-1 text-xs italic text-muted-foreground">{goal.notes}</div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(goal)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDelete(goal.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {!isDone && (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded bg-muted">
                    <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground">{pct}%</div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditing(null)
        }}
      >
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (e.g. Invest €300/month)"
              className="h-20 w-full rounded border p-2"
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                {editing ? 'Save Changes' : 'Add Goal'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
