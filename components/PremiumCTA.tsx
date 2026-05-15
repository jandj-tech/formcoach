'use client'

import { useState } from 'react'
import Link from 'next/link'

type Region = 'US' | 'CA'

export default function PremiumCTA({ dark = false }: { dark?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [region, setRegion] = useState<Region>('US')

  async function handleBuyToken() {
    setLoading(true)
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  const labelColor = dark ? 'text-white' : 'text-black'
  const subColor = dark ? 'text-zinc-400' : 'text-gray-500'
  const borderColor = dark ? 'border-zinc-700' : 'border-orange-200'
  const bgColor = dark ? 'bg-zinc-900' : 'bg-orange-50'
  const currencyCode = region === 'CA' ? 'CAD' : 'USD'

  if (!open) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${bgColor} border ${borderColor}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">🏀</span>
          <span className={`text-sm font-medium truncate ${labelColor}`}>
            1 shot analysis — <span className="font-bold text-orange-500">$4.99 {currencyCode}</span>
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          Buy Token →
        </button>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 space-y-4`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${labelColor}`}>🏀 Buy an Analysis Token</span>
        <button onClick={() => setOpen(false)} className={`text-xs ${subColor} hover:opacity-70`}>✕</button>
      </div>

      <div
        role="group"
        aria-label="Country"
        className="inline-flex items-center gap-1 bg-zinc-800/50 border border-zinc-700 rounded-full p-0.5"
      >
        <button
          type="button"
          onClick={() => setRegion('US')}
          aria-pressed={region === 'US'}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
            region === 'US' ? 'bg-orange-500 text-white' : `${subColor} hover:bg-zinc-700`
          }`}
        >
          🇺🇸 USA
        </button>
        <button
          type="button"
          onClick={() => setRegion('CA')}
          aria-pressed={region === 'CA'}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
            region === 'CA' ? 'bg-orange-500 text-white' : `${subColor} hover:bg-zinc-700`
          }`}
        >
          🇨🇦 Canada
        </button>
      </div>

      <div>
        <p className={`text-xs ${subColor} mb-2`}>Each token gives you one full AI shot analysis across 17 coaching criteria.</p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-orange-500 font-black text-2xl">$4.99</span>
            <span className={`text-xs ${subColor} ml-1`}>{currencyCode}</span>
            <p className={`text-xs ${subColor} mt-0.5`}>per analysis · one-time payment</p>
          </div>
          <button
            onClick={handleBuyToken}
            disabled={loading}
            className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {loading ? '...' : 'Buy Now →'}
          </button>
        </div>
      </div>

      <div className={`text-xs ${subColor} border-t ${borderColor} pt-3`}>
        <span className="font-semibold text-orange-500">Save money:</span>{' '}
        <Link href="/shop" className="underline hover:opacity-80">Buy the training ball</Link> and get 10 free analyses included.
      </div>
    </div>
  )
}
