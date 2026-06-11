'use client'

import { useRouter } from 'next/navigation'

export default function RefreshButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.refresh()}
      className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
    >
      Refresh Prices
    </button>
  )
}