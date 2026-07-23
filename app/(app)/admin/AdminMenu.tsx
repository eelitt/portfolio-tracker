'use client'

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Shield, Users } from 'lucide-react'
import UserManagementModal from './UserManagementModal'

interface AdminMenuProps {
  currentUserId: string
}

/**
 * Admin-only navbar control: shield icon → tools dropdown → modals.
 */
export default function AdminMenu({ currentUserId }: AdminMenuProps) {
  const [userManagementOpen, setUserManagementOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Admin tools"
            title="Admin tools"
          >
            <Shield className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 shadow-lg rounded-md border">
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Admin tools
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => setUserManagementOpen(true)}
          >
            <Users className="mr-2 h-4 w-4" />
            User management
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserManagementModal
        open={userManagementOpen}
        onOpenChange={setUserManagementOpen}
        currentUserId={currentUserId}
      />
    </>
  )
}
