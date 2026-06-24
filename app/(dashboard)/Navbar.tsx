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
import { LogOut, Sun, Moon, Target } from 'lucide-react'
import { useState, useEffect } from 'react'

interface NavbarProps {
  user: any
}

export default function Navbar({ user }: NavbarProps) {
  const router = useRouter()
  const supabase = createClient()

  // Theme state (light | dark). Defaults to light on server; synced on client.
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // On mount: read persisted preference or system, apply to <html>, and sync state.
  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = stored || (prefersDark ? 'dark' : 'light')

    setTheme(initial)
    if (initial === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const toggleGoalsSidebar = () => {
    const currentlyOpen = localStorage.getItem('goalsSidebarOpen') === 'true'
    const newOpen = !currentlyOpen
    localStorage.setItem('goalsSidebarOpen', newOpen.toString())
    window.dispatchEvent(new CustomEvent('goals-sidebar-toggle'))
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const userInitials = user?.email?.[0]?.toUpperCase() || 'U'
  const userName = user?.email?.split('@')[0] || 'User'

  return (
    <nav className="bg-background shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="font-semibold text-2xl tracking-tight">
          Portfolio Tracker
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-8 text-sm font-medium">
          <Link href="/dashboard" className="hover:text-foreground/70 transition-colors">
            Dashboard
          </Link>
          <Link href="#" className="text-muted-foreground cursor-not-allowed">
            Watchlist
          </Link>
          <Link href="#" className="text-muted-foreground cursor-not-allowed">
            Reports
          </Link>
        </div>

        {/* Right side: Theme toggle + User menu */}
        <div className="flex items-center gap-2">
          {/* Clean theme toggle button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* Goals sidebar toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleGoalsSidebar}
            className="h-9 w-9"
            aria-label="Toggle investing goals sidebar"
          >
            <Target className="h-4 w-4" />
          </Button>

          {/* User Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2 h-9 hover:bg-accent">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:block text-sm font-medium pr-1">
                  {userName}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52 shadow-lg rounded-md border">
              <div className="px-3 py-2 text-sm text-muted-foreground truncate">
                {user?.email}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-red-600 focus:text-red-600 cursor-pointer hover:bg-red-50 dark:hover:bg-red-950"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  )
}