'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { HIDE_MONEY_STORAGE_KEY } from '@/lib/privacyMode'

type PrivacyModeContextValue = {
  hideMoney: boolean
  setHideMoney: (value: boolean) => void
  toggleHideMoney: () => void
}

const PrivacyModeContext = createContext<PrivacyModeContextValue | null>(null)

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [hideMoney, setHideMoneyState] = useState(false)

  useEffect(() => {
    try {
      setHideMoneyState(localStorage.getItem(HIDE_MONEY_STORAGE_KEY) === 'true')
    } catch {
      // ignore
    }
  }, [])

  const setHideMoney = useCallback((value: boolean) => {
    setHideMoneyState(value)
    try {
      localStorage.setItem(HIDE_MONEY_STORAGE_KEY, value ? 'true' : 'false')
    } catch {
      // ignore
    }
  }, [])

  const toggleHideMoney = useCallback(() => {
    setHideMoneyState((prev) => {
      const next = !prev
      try {
        localStorage.setItem(HIDE_MONEY_STORAGE_KEY, next ? 'true' : 'false')
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ hideMoney, setHideMoney, toggleHideMoney }),
    [hideMoney, setHideMoney, toggleHideMoney]
  )

  return (
    <PrivacyModeContext.Provider value={value}>
      {children}
    </PrivacyModeContext.Provider>
  )
}

export function usePrivacyMode(): PrivacyModeContextValue {
  const ctx = useContext(PrivacyModeContext)
  if (!ctx) {
    // Safe default when used outside provider (e.g. tests)
    return {
      hideMoney: false,
      setHideMoney: () => {},
      toggleHideMoney: () => {},
    }
  }
  return ctx
}

/**
 * Whether to mask money in the UI.
 *
 * Always false on the server and on the first client render so SSR HTML
 * matches hydration. localStorage privacy preference is applied only after
 * mount — avoids Suspense/hydration mismatches when the provider loads
 * hideMoney=true before a late child hydrates.
 */
export function useHideMoney(): boolean {
  const { hideMoney } = usePrivacyMode()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted && hideMoney
}
