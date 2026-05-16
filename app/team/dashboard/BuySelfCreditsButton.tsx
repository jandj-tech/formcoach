'use client'

import { useState } from 'react'

// Buys one analysis credit for the coach's own uploads — $2.50 if the team
// is initiated, $4.99 otherwise.
export default function BuySelfCreditsButton({ initiated }: { initiated: boolean }) {
  const [loading, setLoading] = useState(false)
  const price = initiated ? '2.50' : '4.99'

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
      className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
    >
      {loading ? 'Redirecting…' : `Buy analysis credit — $${price}`}
    </button>
  )
}
