'use client'

import { useState, useEffect } from 'react'
import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useIsInApp } from '@/lib/useIsInApp'
import { orderPricing, usd, REGULAR_ANALYSIS_PRICE_CENTS, MAX_TOKENS_PER_ORDER } from '@/lib/team-pricing'
import QuantityStepper from '@/components/QuantityStepper'
import VolumeNudge from '@/components/VolumeNudge'

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

// Inside the iOS app the packs render as part of this same page (so the shop
// reads as one continuous store), but tapping one hands off to the native
// Apple in-app purchase — no web checkout ever runs in-app (guideline 3.1.1).
// The app injects its localized StoreKit prices before the page loads.
type AppPackPrices = Partial<Record<1 | 3 | 5, { label: string; amount: number }>>
const APP_FALLBACK_PRICES: AppPackPrices = {
  1: { label: '$3.99', amount: 3.99 },
  3: { label: '$7.99', amount: 7.99 },
  5: { label: '$9.99', amount: 9.99 },
}

function appPackPrices(): AppPackPrices {
  if (typeof window === 'undefined') return APP_FALLBACK_PRICES
  const injected = (window as unknown as { __LH_IAP_PRICES?: AppPackPrices }).__LH_IAP_PRICES
  return { ...APP_FALLBACK_PRICES, ...(injected ?? {}) }
}

export default function TokenPacks() {
  const inApp = useIsInApp()
  const [currency, setCurrency] = useState<string | null>(null)
  const [buyingQty, setBuyingQty] = useState<number | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customQty, setCustomQty] = useState(10)
  const [error, setError] = useState('')

  useEffect(() => {
    if (inApp) return
    fetch('/api/region').then(r => r.json()).then(({ currency: c }) => setCurrency(typeof c === 'string' ? c : null)).catch(() => {})
  }, [inApp])

  if (inApp) {
    const appPrices = appPackPrices()
    const single = appPrices[1]
    return (
      <div className="space-y-3">
        {PACKS.map(({ qty, badge, highlight }) => {
          const price = appPrices[qty as 1 | 3 | 5]
          if (!price) return null
          const save = single && qty > 1
            ? Math.round((1 - price.amount / (single.amount * qty)) * 100)
            : 0
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
                  {qty === 1 ? 'One shot analysis' : `${qty} shot analyses`}
                  {save > 0 ? <span className="text-ember-700 font-bold"> · save {save}%</span> : null}
                </p>
              </div>
              <button
                onClick={() => {
                  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView
                  rn?.postMessage(JSON.stringify({ type: 'iap-buy', pack: qty }))
                }}
                className={`shrink-0 font-bold text-sm px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
                  highlight
                    ? 'bg-ember-500 hover:bg-ember-400 text-white'
                    : 'border-2 border-ember-500 text-ember-700 hover:bg-ember-500/10'
                }`}
              >
                {price.label}
              </button>
            </div>
          )
        })}
      </div>
    )
  }

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
                {usd(custom.unitCents)} per analysis
                {custom.savingsCents > 0 ? (
                  <span className="text-ember-700 font-bold"> · save {usd(custom.savingsCents)} ({Math.round(custom.percentOff)}%)</span>
                ) : (
                  <span> — down to {usd(floorUnit)} each at 15+</span>
                )}
              </p>
            </div>
            <QuantityStepper value={customQty} onChange={setCustomQty} min={1} max={MAX_TOKENS_PER_ORDER} size="sm" ariaLabel="Number of analysis tokens" />
          </div>
          <VolumeNudge
            baseUnitCents={REGULAR_ANALYSIS_PRICE_CENTS}
            quantity={customQty}
            onJump={(q) => setCustomQty(Math.min(MAX_TOKENS_PER_ORDER, q))}
            label="tokens"
            className="mt-3"
          />
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
          className="w-full rounded-xl border-2 border-dashed border-ink-950/25 hover:border-ember-500 bg-white p-4 flex items-center justify-between gap-3 text-left transition-colors"
        >
          <span className="min-w-0">
            <span className="block text-ink-950 font-black text-base">Custom amount</span>
            <span className="block text-ink-950/50 text-xs mt-0.5">
              Pick any number — as low as {usd(floorUnit)} per analysis at 15+
            </span>
          </span>
          <span className="shrink-0 text-ember-500 font-black text-xl" aria-hidden>＋</span>
        </button>
      )}

      {error ? <p className="text-red-600 text-xs">{error}</p> : null}

      <p className="text-ink-950/45 text-[11px] text-center">
        Best prices, any quantity — tokens bought here work everywhere, including the iPhone app.
      </p>
    </div>
  )
}
