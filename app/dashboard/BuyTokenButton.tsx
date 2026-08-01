'use client'

import { useState, useEffect } from 'react'
import { useIsInApp } from '@/lib/useIsInApp'

export default function BuyTokenButton({ isInApp = false, initiated = false }: { isInApp?: boolean; initiated?: boolean }) {
  const inAppUA = useIsInApp()
  const [region, setRegion] = useState('US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const price = initiated ? '1.49' : '2.79'

  useEffect(() => {
    fetch('/api/region').then(r => r.json()).then(({ region: r }) => setRegion(r)).catch(() => {})
  }, [])

  // Digital purchases inside the iOS app must use native in-app purchase.
  if (isInApp || inAppUA) return null

  async function handleClick() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.url) {
        window.location.href = data.url
        return
      }
      setLoading(false)
      setError(data.error === 'Login required' ? 'Please log in first.' : 'Could not start checkout. Please try again.')
    } catch {
      setLoading(false)
      setError('Could not start checkout. Please try again.')
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="shrink-0 border border-ember-500/60 text-ember-400 hover:bg-ember-500/10 disabled:opacity-50 text-sm font-bold px-5 py-2.5 rounded-full transition-colors"
      >
        {loading ? 'Loading...' : `Buy Token — $${price}`}
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </span>
  )
}
