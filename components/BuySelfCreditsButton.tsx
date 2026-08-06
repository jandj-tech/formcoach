'use client'

import { useState } from 'react'
import { useIsInApp } from '@/lib/useIsInApp'

// Buys one analysis credit for a coach / org owner's own uploads —
// $0.99 if their team is initiated, $1.79 otherwise.
export default function BuySelfCreditsButton({ initiated }: { initiated: boolean }) {
  const inApp = useIsInApp()
  const [loading, setLoading] = useState(false)
  const price = initiated ? '0.99' : '1.79'

  // Digital purchases inside the iOS app must use native in-app purchase.
  if (inApp) return null

  async function buy() {
    setLoading(true)
    try {
      const res = await fetch('/api/team/buy-self-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1 }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={buy}
      disabled={loading}
      className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
    >
      {loading ? 'Redirecting…' : `Buy credit — $${price}`}
    </button>
  )
}
