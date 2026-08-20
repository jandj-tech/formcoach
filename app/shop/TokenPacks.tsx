'use client'

import { useState, useEffect } from 'react'
import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useIsInApp } from '@/lib/useIsInApp'
import { orderPricing, usd, REGULAR_ANALYSIS_PRICE_CENTS, MAX_TOKENS_PER_ORDER } from '@/lib/team-pricing'
import QuantityStepper from '@/components/QuantityStepper'

// The classic credit-shop pack picker: preset tiers with the recommended one
// highlighted, per-token anchoring against the single price, and a custom
// amount for bulk buyers. Prices come from lib/team-pricing so this card can
// never disagree with checkout. Light-themed to sit inside the shop's
// bg-chalk analysis section.
const PACKS: Array<{ qty: number; badge?: string; highlight?: boolean }> = [
  { qty: 1 },
  { qty: 3, badge: 'MOST POPULAR' },
  { qty: 5, badge: 'BEST VALUE', highlight: true },
]

export default function TokenPacks() {
  const inApp = useIsInApp()
  const [currency, setCurrency] = useState<string | null>(null)
  const [buyingQty, setBuyingQty] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customQty, setCustomQty] = useState(10)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/region').then(r => r.json()).then(({ currency: c }) => setCurrency(typeof c === 'string' ? c : null)).catch(() => {})
  }, [])

  // Digital purchases inside the iOS app must use native in-app purchase.
  if (inApp) return null

  async function buy(quantity: number) {
    trackInitiateCheckout()
    setBuyingQty(quantity)
    setError('')
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
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
      setBuyingQty(null)
      setError('Could not start checkout. Please try again.')
    } catch {
      setBuyingQty(null)
      setError('Could not start checkout. Please try again.')
    }
  }

  const cur = currency ? ` ${currency}` : ''
  const custom = orderPricing(REGULAR_ANALYSIS_PRICE_CENTS, customQty)
  const floorUnit = orderPricing(REGULAR_ANALYSIS_PRICE_CENTS, 15).unitCents

  return (
    <div className="space-y-3">
      {PACKS.map(({ qty, badge, highlight }) => {
        const p = orderPricing(REGULAR_ANALYSIS_PRICE_CENTS, qty)
        return (
          <div
            key={qty}
            className={`relative rounded-xl border p-4 flex items-center justify-between gap-3 ${
              highlight ? 'border-ember-500 bg-ember-500/5' : 'border-ink-950/15 bg-white'
            }`}
          >
            {badge ? (
              <span className={`absolute -top-2.5 left-4 text-[10px] font-black tracking-widest px-2.5 py-0.5 rounded-full ${
                highlight ? 'bg-ember-500 text-white' : 'bg-ink-950 text-chalk'
              }`}>
                {badge}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="text-ink-950 font-black text-base">
                {qty} {qty === 1 ? 'Analysis Token' : 'Analysis Tokens'}
              </p>
              <p className="text-ink-950/50 text-xs mt-0.5">
                {usd(p.unitCents)} per analysis
                {p.savingsCents > 0 ? <span className="text-ember-700 font-bold"> · save {usd(p.savingsCents)}</span> : null}
              </p>
            </div>
            <button
              onClick={() => buy(qty)}
              disabled={buyingQty !== null}
              className={`shrink-0 font-bold text-sm px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
                highlight
                  ? 'bg-ember-500 hover:bg-ember-400 text-white'
                  : 'border-2 border-ember-500 text-ember-700 hover:bg-ember-500/10'
              }`}
            >
              {buyingQty === qty ? '...' : `${usd(p.totalCents)}${cur}`}
            </button>
          </div>
        )
      })}

      {/* Bulk buyers: any amount, ladder pricing down to the floor. */}
      {customOpen ? (
        <div className="rounded-xl border border-ink-950/15 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-ink-950 font-black text-base">Custom amount</p>
              <p className="text-ink-950/50 text-xs mt-0.5">
                {usd(custom.unitCents)} per analysis — down to {usd(floorUnit)} each at 15+
              </p>
            </div>
            <QuantityStepper value={customQty} onChange={setCustomQty} min={1} max={MAX_TOKENS_PER_ORDER} size="sm" ariaLabel="Number of analysis tokens" />
          </div>
          <button
            onClick={() => buy(customQty)}
            disabled={buyingQty !== null}
            className="mt-3 w-full bg-ink-950 hover:bg-ink-800 text-chalk font-bold text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {buyingQty === customQty ? '...' : `Buy ${customQty} tokens — ${usd(custom.totalCents)}${cur}`}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          className="w-full text-center text-ink-950/60 hover:text-ink-950 text-xs font-semibold underline underline-offset-2 py-1"
        >
          Need more? Choose a custom amount — as low as {usd(floorUnit)} per analysis
        </button>
      )}

      {error ? <p className="text-red-600 text-xs">{error}</p> : null}
    </div>
  )
}
