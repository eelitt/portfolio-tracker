'use client'

import { useState, useEffect } from 'react'
import { getUserGoals, createGoal, updateGoal, deleteGoal, getCurrentPortfolioValue } from '@/app/actions/goals'
import { getCurrentUserProfile, type PreferredCurrency } from '@/app/actions/users'
import { formatCurrency } from '@/lib/currency'
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

export default function GoalsSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const [goals, setGoals] = useState<Goal[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [notes, setNotes] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [preferredCurrency, setPreferredCurrency] = useState<PreferredCurrency>('USD')
  const [usdToPreferredRate, setUsdToPreferredRate] = useState(1)

  const loadGoals = async () => {
    const data = await getUserGoals()
    setGoals(data)
  }

  const loadPortfolioValue = async () => {
    const val = await getCurrentPortfolioValue()
    setPortfolioValue(val)
  }

  const loadCurrencyPreference = async () => {
    const profile = await getCurrentUserProfile()
    if (profile) {
      setPreferredCurrency(profile.preferredCurrency)
      // For client side display, we use a simple rate fetch if needed
      // Since portfolioValue is already converted in getPortfolioData, we just need symbol
      // But for full accuracy we could fetch rate, here we rely on pre-converted value
      setUsdToPreferredRate(1) // not used for display since value is pre-converted
    }
  }

  useEffect(() => {
    loadGoals()
    loadPortfolioValue()
    loadCurrencyPreference()

    const handleToggle = () => {
      const open = localStorage.getItem('goalsSidebarOpen') === 'true'
      setIsOpen(open)
      if (open) {
        loadGoals()
        loadPortfolioValue()
        loadCurrencyPreference()
      } else {
        // close any open inner dialog when sidebar is closed externally
        setDialogOpen(false)
        setEditing(null)
      }
    }
    window.addEventListener('goals-sidebar-toggle', handleToggle)

    const handlePortfolioUpdate = () => {
      loadPortfolioValue()
      loadCurrencyPreference()
    }
    window.addEventListener('portfolio-updated', handlePortfolioUpdate)

    const initial = localStorage.getItem('goalsSidebarOpen') === 'true'
    setIsOpen(initial)
    if (initial) {
      loadGoals()
      loadPortfolioValue()
      loadCurrencyPreference()
    }

    return () => {
      window.removeEventListener('goals-sidebar-toggle', handleToggle)
      window.removeEventListener('portfolio-updated', handlePortfolioUpdate)
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
      loadPortfolioValue()
    }
  }

  const handleDelete = async (id: string) => {
    const result = await deleteGoal(id)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success('Goal deleted')
      loadGoals()
      loadPortfolioValue()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-16 bottom-0 w-80 bg-muted dark:bg-slate-800 shadow-xl z-40 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={closeSidebar}
            className="group h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
            aria-label="Close goals sidebar"
          >
            <X className="h-4 w-4 transition-transform group-hover:scale-110" />
          </Button>
          <h2 className="text-lg font-semibold">Investing Goals</h2>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="text-sm text-muted-foreground mb-3">
        Current portfolio: {formatCurrency(portfolioValue, preferredCurrency, 1)}
      </div>

      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No goals yet. Add your first investing goal to track progress.
        </p>
      )}

      <div className="space-y-3 bg-card shadow-lg">
        {goals.map((goal) => {
          const current = portfolioValue
          const pct = goal.target_amount > 0
            ? Math.min(100, Math.round((current / goal.target_amount) * 100))
            : 0
          const isDone = goal.is_completed
          return (
            <div key={goal.id} className={`border rounded p-3 ${isDone ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className={`font-medium ${isDone ? 'line-through' : ''}`}>
                    {goal.name} {isDone && '✓'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(current, preferredCurrency, 1)} / {formatCurrency(goal.target_amount, preferredCurrency, 1)}
                  </div>
                  {goal.notes && (
                    <div className="text-xs text-muted-foreground mt-1 italic">{goal.notes}</div>
                  )}
                  {goal.completed_at && (
                    <div className="text-[10px] text-green-600 mt-0.5">
                      Completed {new Date(goal.completed_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
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
                  <div className="mt-2 h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-2 bg-primary rounded"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-right mt-0.5 text-muted-foreground">
                    {pct}%
                  </div>
                </>
              )}
            </div>
          )
        })}
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
