'use client'

import { useState } from 'react'
import { useIsInApp } from '@/lib/useIsInApp'
import { analysisUnitCents, orderPricing, usd, MAX_COACH_CREDITS_PER_ORDER } from '@/lib/team-pricing'
import QuantityStepper from '@/components/QuantityStepper'

// Buys analysis credits for a coach / org owner's own uploads —
// $1.49 each if their team is initiated, $3.49 otherwise, with the same
// volume tiers every other buy flow uses.
export default function BuySelfCreditsButton({ initiated }: { initiated: boolean }) {
  const inApp = useIsInApp()
  const [loading, setLoading] = useState(false)
  const [qty, setQty] = useState(1)
  const { percentOff, totalCents } = orderPricing(analysisUnitCents(initiated), qty)

  // Digital purchases inside the iOS app must use native in-app purchase.
  if (inApp) return null

  async function buy() {
    setLoading(true)
    try {
      const res = await fetch('/api/team/buy-self-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
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
    <span className="inline-flex flex-col items-end gap-1.5">
      <span className="inline-flex items-center gap-2">
        <QuantityStepper value={qty} onChange={setQty} min={1} max={MAX_COACH_CREDITS_PER_ORDER} size="sm" ariaLabel="Number of credits" />
        <button
          onClick={buy}
          disabled={loading}
          className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors"
        >
          {loading ? 'Redirecting…' : `Buy ${qty > 1 ? `${qty} credits` : 'credit'} — ${usd(totalCents)}`}
        </button>
      </span>
      {percentOff > 0 && (
        <span className="text-green-600 text-xs font-semibold">{percentOff}% volume discount applied</span>
      )}
    </span>
  )
}
