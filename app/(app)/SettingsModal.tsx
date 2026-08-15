'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useDashboardLayout } from './dashboard/DashboardLayoutProvider'
import { ChangePasswordForm } from './ChangePasswordModal'
import type { DashboardLayoutMode } from '@/lib/dashboardLayout'

const LAYOUTS: {
  id: DashboardLayoutMode
  title: string
  description: string
}[] = [
  {
    id: 'all',
    title: 'All sections',
    description: 'Summary, holdings, watchlist, and transactions on one page.',
  },
  {
    id: 'focus',
    title: 'Focus one section',
    description: 'Summary stays up top. Tabs switch holdings, watchlist, or transactions.',
  },
]

export default function SettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { layout, setLayout } = useDashboardLayout()
  const [resetToken, setResetToken] = useState(0)

  useEffect(() => {
    if (!open) setResetToken((n) => n + 1)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] shadow-xl rounded-xl border ring-0">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Choose how the dashboard is laid out, or update your password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Dashboard layout</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {LAYOUTS.map((opt) => {
                const selected = layout === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setLayout(opt.id)}
                    className={cn(
                      'rounded-xl border px-3 py-3 text-left transition-colors',
                      selected
                        ? 'border-gold bg-gold/10'
                        : 'border-subtle bg-surface-elevated hover:border-gold/50'
                    )}
                  >
                    <div className="text-sm font-medium">{opt.title}</div>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {opt.description}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-2 border-t border-subtle pt-4">
            <h3 className="text-sm font-medium">Change password</h3>
            <p className="text-xs text-muted-foreground">
              At least 8 characters. You will stay signed in.
            </p>
            <ChangePasswordForm resetToken={resetToken} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
