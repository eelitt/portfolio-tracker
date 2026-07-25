'use client'

import { useState, useEffect, useRef } from 'react'
import {
  getUserGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getCurrentPortfolioValue,
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
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  PORTFOLIO_VALUE_EVENT,
  type PortfolioValueDetail,
} from '@/app/(app)/dashboard/summary/PortfolioValueSync'

interface GoalsSidebarProps {
  /** From layout profile — do not load via lib/user on the client. */
  preferredCurrency?: PreferredCurrency
}

export default function GoalsSidebar({
  preferredCurrency = 'USD',
}: GoalsSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isOpenRef = useRef(false)
  /** True once Summary (or fallback) has published a mark this session. */
  const hasPortfolioValueRef = useRef(false)
  const [goals, setGoals] = useState<Goal[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)
  const [portfolioValue, setPortfolioValue] = useState(0)

  const loadGoals = async () => {
    const data = await getUserGoals()
    setGoals(data)
  }

  /** Fallback only — avoids second price fetch when Summary already broadcast. */
  const loadPortfolioValueFallback = async () => {
    if (hasPortfolioValueRef.current) return
    const val = await getCurrentPortfolioValue()
    hasPortfolioValueRef.current = true
    setPortfolioValue(val)
  }

  // Load goals list only when the sidebar is visible (no price re-fetch).
  useEffect(() => {
    isOpenRef.current = isOpen
    if (isOpen) {
      loadGoals()
      // If Summary has not mounted yet (or never will), one deferred fallback.
      const t = window.setTimeout(() => {
        void loadPortfolioValueFallback()
      }, 1500)
      return () => window.clearTimeout(t)
    }
  }, [isOpen])

  useEffect(() => {
    const handleToggle = () => {
      const open = localStorage.getItem('goalsSidebarOpen') === 'true'
      setIsOpen(open)
      if (!open) {
        setDialogOpen(false)
        setEditing(null)
      }
    }
    window.addEventListener('goals-sidebar-toggle', handleToggle)

    // Same mark as Summary — no second getPortfolioData / Binance round-trip.
    const handlePortfolioValue = (e: Event) => {
      const detail = (e as CustomEvent<PortfolioValueDetail>).detail
      if (!detail || typeof detail.value !== 'number') return
      hasPortfolioValueRef.current = true
      setPortfolioValue(detail.value)
    }
    window.addEventListener(PORTFOLIO_VALUE_EVENT, handlePortfolioValue)

    // After tx / refresh, Summary re-renders and re-broadcasts portfolio-value.
    // Do not call getCurrentPortfolioValue here (that was the double-fetch).

    const initial = localStorage.getItem('goalsSidebarOpen') === 'true'
    setIsOpen(initial)

    return () => {
      window.removeEventListener('goals-sidebar-toggle', handleToggle)
      window.removeEventListener(PORTFOLIO_VALUE_EVENT, handlePortfolioValue)
    }
  }, [])

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

  const closeDialog = () => {
    setDialogOpen(false)
    setEditing(null)
  }

  const closeSidebar = () => {
    localStorage.setItem('goalsSidebarOpen', 'false')
    setIsOpen(false)
    setDialogOpen(false)
    setEditing(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    formData.set('name', name)
    formData.set('target_amount', target)
    formData.set('notes', notes)
    formData.set('is_completed', isCompleted ? 'true' : 'false')

    let result
    if (editing) {
      result = await updateGoal(editing.id, formData)
    } else {
      result = await createGoal(null as any, formData)
    }

    if (result?.error) {
      const msg = typeof result.error === 'string' ? result.error : 'Failed to save goal'
      toast.error(msg)
    } else {
      toast.success(editing ? 'Goal updated' : 'Goal added')
      closeDialog()
      loadGoals()
    }
  }

  const handleDelete = async (id: string) => {
    const result = await deleteGoal(id)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success('Goal deleted')
      loadGoals()
    }
  }

  if (!isOpen) return null

  return (
    <div className="surface-panel panel-gold-grid panel-gold-grid--right fixed right-0 top-16 bottom-0 z-40 flex w-80 flex-col overflow-hidden border-l border-border shadow-xl">
      <div className="panel-gold-grid-bg" aria-hidden />
      <div className="panel-gold-grid-header relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-subtle px-4 pb-5 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={closeSidebar}
            className="group h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
            aria-label="Close goals sidebar"
          >
            <X className="h-4 w-4 transition-transform group-hover:scale-110" />
          </Button>
          <h2 className="section-title">
            <span className="section-title-accent">Investing Goals</span>
          </h2>
        </div>
        <Button size="sm" onClick={openAdd} className="shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 text-sm text-muted-foreground">
          Current portfolio:{' '}
          <span className="font-medium text-foreground">
            <SensitiveValue
              value={formatCurrency(portfolioValue, preferredCurrency, 1)}
            />
          </span>
        </div>

        {goals.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No goals yet. Add your first investing goal to track progress.
          </p>
        )}

        <div className="space-y-3">
          {goals.map((goal) => {
            const current = portfolioValue
            const pct = goal.target_amount > 0
              ? Math.min(100, Math.round((current / goal.target_amount) * 100))
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
                        value={formatCurrency(current, preferredCurrency, 1)}
                      />{' '}
                      /{' '}
                      <SensitiveValue
                        value={formatCurrency(goal.target_amount, preferredCurrency, 1)}
                      />
                    </div>
                    {goal.notes && (
                      <div className="text-xs text-muted-foreground mt-1 italic">{goal.notes}</div>
                    )}
                    {goal.completed_at && (
                      <div className="mt-0.5 text-[10px] text-pnl-positive">
                        Completed {new Date(goal.completed_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => openEdit(goal)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleDelete(goal.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {!isDone && (
                  <>
                    <div className="mt-2 h-2 overflow-hidden rounded bg-muted">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                      {pct}%
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => {
        setDialogOpen(o)
        if (!o) setEditing(null)
      }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Goal' : 'New Investing Goal'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Retirement)"
              className="w-full border p-2 rounded"
              required
            />
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              type="number"
              step="any"
              placeholder="Target amount"
              className="w-full border p-2 rounded"
              required
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (e.g. Invest €300/month)"
              className="w-full border p-2 rounded h-20"
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
    </div>
  )
}
