'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { changePassword } from '@/app/actions/users'
import { changePasswordSchema } from '@/lib/schemas'
import { fieldClassName, labelClassName } from './dashboard/transactions/formStyles'

interface ChangePasswordModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const emptyForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
}

export function ChangePasswordForm({
  onSuccess,
  resetToken = 0,
}: {
  onSuccess?: () => void
  /** Increment to clear fields (e.g. when the parent dialog closes). */
  resetToken?: number
}) {
  const [form, setForm] = useState(emptyForm)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setForm(emptyForm)
    setPending(false)
  }, [resetToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pending) return

    const parsed = changePasswordSchema.safeParse(form)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid password form')
      return
    }

    setPending(true)
    try {
      const result = await changePassword(parsed.data)
      if ('error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Password updated')
      setForm(emptyForm)
      onSuccess?.()
    } catch {
      toast.error('Could not update password. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="current-password" className={labelClassName}>
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, currentPassword: e.target.value }))
              }
              className={fieldClassName}
              disabled={pending}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-password" className={labelClassName}>
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, newPassword: e.target.value }))
              }
              className={fieldClassName}
              disabled={pending}
              required
              minLength={8}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className={labelClassName}>
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
              }
              className={fieldClassName}
              disabled={pending}
              required
              minLength={8}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                'Change password'
              )}
            </Button>
          </DialogFooter>
        </form>
  )
}

export default function ChangePasswordModal({
  open,
  onOpenChange,
}: ChangePasswordModalProps) {
  const [resetToken, setResetToken] = useState(0)

  const handleClose = (next: boolean) => {
    onOpenChange(next)
    if (!next) setResetToken((n) => n + 1)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px] shadow-xl rounded-xl border ring-0">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one (at least 8 characters).
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm
          resetToken={resetToken}
          onSuccess={() => handleClose(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
