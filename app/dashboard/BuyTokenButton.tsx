'use client'

import { useState, useEffect } from 'react'
import { useIsInApp } from '@/lib/useIsInApp'
import { useAnalysisPrice } from '@/lib/useAnalysisPrice'
import { orderPricing, usd, MAX_TOKENS_PER_ORDER } from '@/lib/team-pricing'
import QuantityStepper from '@/components/QuantityStepper'

export default function BuyTokenButton({ isInApp = false, initiated = false }: { isInApp?: boolean; initiated?: boolean }) {
  const inAppUA = useIsInApp()
  const [region, setRegion] = useState('US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [qty, setQty] = useState(1)
  const { baseUnitCents } = useAnalysisPrice(initiated)
  const { percentOff, totalCents } = orderPricing(baseUnitCents, qty)

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
        body: JSON.stringify({ region, quantity: qty }),
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
    <span className="inline-flex flex-col items-end gap-1.5">
      <span className="inline-flex items-center gap-2">
        <QuantityStepper value={qty} onChange={setQty} min={1} max={MAX_TOKENS_PER_ORDER} size="sm" ariaLabel="Number of analysis tokens" />
        <button
          onClick={handleClick}
          disabled={loading}
          className="shrink-0 border-2 border-orange-500 text-orange-600 hover:bg-orange-100 disabled:opacity-50 text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          {loading ? 'Loading...' : `Buy ${qty > 1 ? `${qty} Tokens` : 'Token'} — ${usd(totalCents)}`}
        </button>
      </span>
      {percentOff > 0 && (
        <span className="text-green-600 text-xs font-semibold">{percentOff}% volume discount applied</span>
      )}
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </span>
  )
}
