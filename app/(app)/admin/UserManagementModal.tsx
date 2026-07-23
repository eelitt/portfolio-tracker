'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import type { AdminUserRow } from '@/app/actions/admin'
import {
  getCachedAdminUsers,
  loadAdminUsers,
} from './adminUsersCache'
import UserManagementTable from './UserManagementTable'

interface UserManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId: string
}

export default function UserManagementModal({
  open,
  onOpenChange,
  currentUserId,
}: UserManagementModalProps) {
  const [users, setUsers] = useState<AdminUserRow[]>(() => getCachedAdminUsers() ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = useCallback(async (force: boolean) => {
    if (!force) {
      const cached = getCachedAdminUsers()
      if (cached) {
        setUsers(cached)
        setError(null)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setError(null)

    const result = await loadAdminUsers({ force })

    if (result.error) {
      setError(result.error)
      if (!getCachedAdminUsers()) {
        setUsers([])
      }
    } else {
      setUsers(result.data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    void fetchUsers(false)
  }, [open, fetchUsers])

  const handleReload = useCallback(async () => {
    await fetchUsers(true)
  }, [fetchUsers])

  const showTable = users.length > 0 || (!loading && !error)
  const showInitialLoading = loading && users.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>User management</DialogTitle>
              <DialogDescription>
                Grant admin privileges or app access. List reloads after each change.
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => void handleReload()}
              disabled={loading}
              aria-label="Refresh user list"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
          {showInitialLoading && (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Loading users…
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300 mb-3">
              {error}
            </div>
          )}

          {showTable && (
            <UserManagementTable
              users={users}
              currentUserId={currentUserId}
              onReload={handleReload}
              disabled={loading}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
