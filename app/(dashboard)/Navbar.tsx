'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface NavbarProps {
  user: any
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const userInitials = user?.email?.[0]?.toUpperCase() || 'U'
  const userName = user?.email?.split('@')[0] || 'User'

  return (
    <nav className="border-b bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="font-semibold text-2xl tracking-tight">
          Portfolio Tracker
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-8 text-sm font-medium">
          <Link href="/dashboard" className="hover:text-gray-600 transition-colors">
            Dashboard
          </Link>
          <Link href="#" className="text-gray-400 cursor-not-allowed">
            Watchlist
          </Link>
          <Link href="#" className="text-gray-400 cursor-not-allowed">
            Reports
          </Link>
        </div>

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 h-9">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-gray-200 text-gray-700 text-sm">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm font-medium pr-1">
                {userName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-3 py-2 text-sm text-gray-500 truncate">
              {user?.email}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 focus:text-red-600 cursor-pointer"
            >
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}