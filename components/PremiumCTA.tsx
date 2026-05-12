'use client'

import { useState } from 'react'

export default function PremiumCTA({ dark = false }: { dark?: boolean }) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${
      dark
        ? 'bg-zinc-900 border border-zinc-700'
        : 'bg-orange-50 border border-orange-200'
    }`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">🔓</span>
        <span className={`text-sm font-medium truncate ${dark ? 'text-white' : 'text-black'}`}>
          Unlimited analyses from <span className="font-bold text-orange-500">$2.49/mo</span>
        </span>
      </div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        {loading ? '...' : 'Upgrade →'}
      </button>
    </div>
  )
}
