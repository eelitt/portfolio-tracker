'use client'

import { useState, useEffect } from 'react'

export function useAIInsightsSidebar() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleToggle = () => {
      const open = localStorage.getItem('aiInsightsSidebarOpen') === 'true'
      setIsOpen(open)
    }
    window.addEventListener('ai-insights-toggle', handleToggle)

    const initial = localStorage.getItem('aiInsightsSidebarOpen') === 'true'
    setIsOpen(initial)

    return () => window.removeEventListener('ai-insights-toggle', handleToggle)
  }, [])

  const close = () => {
    localStorage.setItem('aiInsightsSidebarOpen', 'false')
    setIsOpen(false)
  }

  const resetOnOpen = () => {
    // This can be called when we detect open in the component if needed
  }

  return {
    isOpen,
    close,
  }
}
