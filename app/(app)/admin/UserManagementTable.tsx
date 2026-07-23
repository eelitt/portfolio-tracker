'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  updateUserAccessFlags,
  type AdminUserRow,
} from '@/app/actions/admin'

interface UserManagementTableProps {
  users: AdminUserRow[]
  currentUserId: string
  onReload: () => Promise<void>
  disabled?: boolean
}

export default function UserManagementTable({
  users,
  currentUserId,
  onReload,
  disabled = false,
}: UserManagementTableProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const applyToggle = (
    userId: string,
    field: 'admin' | 'accessToApp',
    value: boolean
  ) => {
    const key = `${userId}:${field}`
    setPendingKey(key)

    startTransition(async () => {
      const payload =
        field === 'admin'
          ? { userId, admin: value }
          : { userId, accessToApp: value }

      const result = await updateUserAccessFlags(payload)

      if (result.error) {
        toast.error(result.error)
        setPendingKey(null)
        return
      }

      toast.success('User updated')
      try {
        await onReload()
      } catch {
        toast.error('Updated, but failed to refresh the list')
      }
      setPendingKey(null)
    })
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No users found.
      </p>
    )
  }

  const tableLocked = disabled || pendingKey !== null

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium w-28">Admin</th>
            <th className="px-4 py-3 font-medium w-36">Access to app</th>
            <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
              User ID
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId
            const rowBusy = pendingKey?.startsWith(`${user.id}:`)

            return (
              <tr
                key={user.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <div className="font-medium truncate max-w-[200px] sm:max-w-xs">
                    {user.email}
                  </div>
                  {isSelf && (
                    <span className="text-xs text-muted-foreground">You</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-foreground cursor-pointer disabled:opacity-50"
                    checked={user.admin}
                    disabled={
                      tableLocked ||
                      rowBusy ||
                      (isSelf && user.admin)
                    }
                    title={
                      isSelf && user.admin
                        ? 'You cannot remove your own admin access'
                        : undefined
                    }
                    aria-label={`Admin for ${user.email}`}
                    onChange={(e) =>
                      applyToggle(user.id, 'admin', e.target.checked)
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-foreground cursor-pointer disabled:opacity-50"
                    checked={user.accessToApp}
                    disabled={tableLocked || rowBusy}
                    aria-label={`Access to app for ${user.email}`}
                    onChange={(e) =>
                      applyToggle(user.id, 'accessToApp', e.target.checked)
                    }
                  />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground font-mono hidden sm:table-cell">
                  <span className="truncate inline-block max-w-[10rem]" title={user.id}>
                    {user.id.slice(0, 8)}…
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
