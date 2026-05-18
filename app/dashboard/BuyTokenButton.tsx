'use client'

import { useState, useEffect } from 'react'

export default function BuyTokenButton() {
  const [region, setRegion] = useState('US')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/region').then(r => r.json()).then(({ region: r }) => setRegion(r)).catch(() => {})
  }, [])

  async function handleClick() {
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

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
    >
      {loading ? 'Loading...' : 'Buy Token — $2.79'}
    </button>
  )
}
