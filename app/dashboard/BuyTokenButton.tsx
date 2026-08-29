'use client'

import { useState, useEffect } from 'react'
import { useIsInApp } from '@/lib/useIsInApp'
import { useAnalysisPrice } from '@/lib/useAnalysisPrice'
import { orderPricing, percentLabel, usd, MAX_TOKENS_PER_ORDER } from '@/lib/team-pricing'
import QuantityStepper from '@/components/QuantityStepper'
import VolumeNudge from '@/components/VolumeNudge'
import type { OrgTier } from '@/lib/team-pricing'

export default function BuyTokenButton({ isInApp = false, initialTier = 'none' }: { isInApp?: boolean; initialTier?: OrgTier }) {
  const inAppUA = useIsInApp()
  // Display only — the server picks the currency from the request itself.
  const [currency, setCurrency] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [qty, setQty] = useState(1)
  const { tier, baseUnitCents } = useAnalysisPrice(initialTier)
  const { percentOff, totalCents } = orderPricing(tier, qty)

  useEffect(() => {
    fetch('/api/region').then(r => r.json()).then(({ currency: c }) => setCurrency(typeof c === 'string' ? c : null)).catch(() => {})
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
        body: JSON.stringify({ quantity: qty }),
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
          className="shrink-0 border-2 border-orange-500 text-orange-600 dark:text-ember-400 hover:bg-orange-100 dark:hover:bg-ember-500/15 disabled:opacity-50 text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
        >
          {loading
            ? 'Loading...'
            : `Buy ${qty > 1 ? `${qty} Tokens` : 'Token'} — ${usd(totalCents)}${currency ? ` ${currency}` : ''}`}
        </button>
      </span>
      {percentOff > 0 && (
        <span className="text-green-600 dark:text-green-400 text-xs font-semibold">{percentLabel(percentOff)}% volume discount applied</span>
      )}
      <VolumeNudge
        tier={tier}
        quantity={qty}
        onJump={(q) => setQty(Math.min(MAX_TOKENS_PER_ORDER, q))}
        className="w-full max-w-[19rem]"
      />
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </span>
  )
}
