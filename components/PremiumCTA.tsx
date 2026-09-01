'use client'

import { useState, useEffect } from 'react'
import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useIsInApp } from '@/lib/useIsInApp'
import { useAnalysisPrice } from '@/lib/useAnalysisPrice'
import { orderPricing, percentLabel, usd, MAX_TOKENS_PER_ORDER } from '@/lib/team-pricing'
import { PLAYER_PLANS } from '@/lib/player-plans'
import QuantityStepper from '@/components/QuantityStepper'
import VolumeNudge from '@/components/VolumeNudge'
import Link from 'next/link'
import type { OrgTier } from '@/lib/team-pricing'

export default function PremiumCTA({ dark = false, initialTier = 'none' }: { dark?: boolean; initialTier?: OrgTier }) {
  const inApp = useIsInApp()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  // Display only — the server picks the currency from the request itself.
  const [currency, setCurrency] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [qty, setQty] = useState(1)
  const { tier, baseUnitCents } = useAnalysisPrice(initialTier)
  const { percentOff, unitCents, totalCents, savingsCents } = orderPricing(tier, qty)
  const price = (baseUnitCents / 100).toFixed(2)

  useEffect(() => {
    fetch('/api/region').then(r => r.json()).then(({ currency: c }) => setCurrency(typeof c === 'string' ? c : null)).catch(() => {})
  }, [])

  // Digital purchases inside the iOS app must use native in-app purchase.
  if (inApp) return null

  async function handleBuyToken() {
    trackInitiateCheckout()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      })
      if (res.status === 401) {
        // Logged-out visitor: send them to log in, then back here.
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data.url) {
        window.location.href = data.url
        return
      }
      setLoading(false)
      setError('Could not start checkout. Please try again.')
    } catch {
      setLoading(false)
      setError('Could not start checkout. Please try again.')
    }
  }

  const labelColor = dark ? 'text-white' : 'text-black'
  const subColor = dark ? 'text-zinc-400' : 'text-gray-500'
  const borderColor = dark ? 'border-zinc-700' : 'border-orange-200'
  const bgColor = dark ? 'bg-zinc-900' : 'bg-orange-50'

  if (!open) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${bgColor} border ${borderColor}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">🏀</span>
          <span className={`text-sm font-medium truncate ${labelColor}`}>
            1 shot analysis — <span className="font-bold text-orange-500">${price}</span>
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 bg-ember-500 hover:bg-ember-400 text-ink-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
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

      <div>
        <p className={`text-xs ${subColor} mb-3`}>Each token gives you one full AI shot analysis across 18 coaching criteria.</p>

        <div className="flex items-center justify-between gap-3 mb-3">
          <span className={`text-sm font-medium ${labelColor}`}>How many?</span>
          <QuantityStepper value={qty} onChange={setQty} min={1} max={MAX_TOKENS_PER_ORDER} size="sm" ariaLabel="Number of analysis tokens" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-orange-500 font-black text-2xl">
              {usd(totalCents)}
              {currency && <span className="text-sm font-bold ml-1">{currency}</span>}
            </span>
            <p className={`text-xs ${subColor} mt-0.5`}>
              {qty === 1
                ? 'per analysis · one-time payment'
                : `${qty} analyses · ${usd(unitCents)} each`}
            </p>
            {percentOff > 0 && (
              <p className="text-xs text-green-500 font-semibold mt-0.5">
                {percentLabel(percentOff)}% volume discount — you save {usd(savingsCents)}
              </p>
            )}
          </div>
          <button
            onClick={handleBuyToken}
            disabled={loading}
            className="shrink-0 bg-ember-500 hover:bg-ember-400 disabled:bg-orange-300 text-ink-950 text-sm font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {loading ? '...' : 'Buy Now →'}
          </button>
        </div>
        <VolumeNudge
          tier={tier}
          quantity={qty}
          onJump={(q) => setQty(Math.min(MAX_TOKENS_PER_ORDER, q))}
          className="mt-3"
        />
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>

      <div className={`text-xs ${subColor} border-t ${borderColor} pt-3 space-y-1`}>
        <p>
          <span className="font-semibold text-orange-500">Analyze every week?</span>{' '}
          <Link href="/pricing" className="underline hover:opacity-80">Plans</Link> start at{' '}
          {usd(PLAYER_PLANS.player.monthlyCents)}/month for {PLAYER_PLANS.player.weeklyLimit} analyses
          a week (up to {PLAYER_PLANS.player.monthlyLimit}/month).
        </p>
        <p>
          <span className="font-semibold text-orange-500">Save money:</span>{' '}
          <Link href="/shop" className="underline hover:opacity-80">Buy the training ball</Link> and get 5 free analyses included — or 10 with the 2-ball bundle.
        </p>
      </div>
    </div>
  )
}
