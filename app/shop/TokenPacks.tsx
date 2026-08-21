'use client'

import { useState, useEffect } from 'react'
import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useIsInApp } from '@/lib/useIsInApp'
import { orderPricing, usd, REGULAR_ANALYSIS_PRICE_CENTS, MAX_TOKENS_PER_ORDER } from '@/lib/team-pricing'
import QuantityStepper from '@/components/QuantityStepper'
import VolumeNudge from '@/components/VolumeNudge'

// The classic credit-shop pack picker: preset tiers with the recommended one
// highlighted, per-token anchoring against the single price, and a custom
// amount for bulk buyers. Prices come from lib/team-pricing so this can never
// disagree with checkout. `dark` matches the store's ink theme.
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

function styles(dark: boolean) {
  return {
    card: dark ? 'border-courtline bg-ink-900' : 'border-ink-950/15 bg-white',
    cardHighlight: dark ? 'border-ember-500 bg-ember-500/10' : 'border-ember-500 bg-ember-500/5',
    badge: dark ? 'bg-ink-700 text-chalk' : 'bg-ink-950 text-chalk',
    badgeHighlight: 'bg-ember-500 text-white',
    title: dark ? 'text-chalk' : 'text-ink-950',
    sub: dark ? 'text-chalk-dim' : 'text-ink-950/50',
    save: dark ? 'text-ember-400' : 'text-ember-700',
    buyOutline: dark
      ? 'border-2 border-ember-500 text-ember-400 hover:bg-ember-500/10'
      : 'border-2 border-ember-500 text-ember-700 hover:bg-ember-500/10',
    buyFill: 'bg-ember-500 hover:bg-ember-400 text-white',
    customShell: dark ? 'border-courtline bg-ink-900' : 'border-ink-950/15 bg-white',
    customDashed: dark
      ? 'border-2 border-dashed border-courtline hover:border-ember-500 bg-ink-900'
      : 'border-2 border-dashed border-ink-950/25 hover:border-ember-500 bg-white',
    customBuy: dark
      ? 'bg-chalk hover:bg-white text-ink-950'
      : 'bg-ink-950 hover:bg-ink-800 text-chalk',
    note: dark ? 'text-chalk-dim/80' : 'text-ink-950/45',
  }
}

export default function TokenPacks({ dark = false }: { dark?: boolean }) {
  const inApp = useIsInApp()
  const s = styles(dark)
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
              className={`relative rounded-xl border p-4 flex items-center justify-between gap-3 ${highlight ? s.cardHighlight : s.card}`}
            >
              {badge ? (
                <span className={`absolute -top-2.5 left-4 text-[10px] font-black tracking-widest px-2.5 py-0.5 rounded-full ${
                  highlight ? s.badgeHighlight : s.badge
                }`}>
                  {badge}
                </span>
              ) : null}
              <div className="min-w-0">
                <p className={`font-black text-base ${s.title}`}>
                  {qty} {qty === 1 ? 'Analysis Token' : 'Analysis Tokens'}
                </p>
                <p className={`text-xs mt-0.5 ${s.sub}`}>
                  {qty === 1 ? 'One shot analysis' : `${qty} shot analyses`}
                  {save > 0 ? <span className={`font-bold ${s.save}`}> · save {save}%</span> : null}
                </p>
              </div>
              <button
                onClick={() => {
                  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } }).ReactNativeWebView
                  rn?.postMessage(JSON.stringify({ type: 'iap-buy', pack: qty }))
                }}
                className={`shrink-0 font-bold text-sm px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
                  highlight ? s.buyFill : s.buyOutline
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
            className={`relative rounded-xl border p-4 flex items-center justify-between gap-3 ${highlight ? s.cardHighlight : s.card}`}
          >
            {badge ? (
              <span className={`absolute -top-2.5 left-4 text-[10px] font-black tracking-widest px-2.5 py-0.5 rounded-full ${
                highlight ? s.badgeHighlight : s.badge
              }`}>
                {badge}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className={`font-black text-base ${s.title}`}>
                {qty} {qty === 1 ? 'Analysis Token' : 'Analysis Tokens'}
              </p>
              <p className={`text-xs mt-0.5 ${s.sub}`}>
                {usd(p.unitCents)} per analysis
                {p.savingsCents > 0 ? <span className={`font-bold ${s.save}`}> · save {usd(p.savingsCents)}</span> : null}
              </p>
            </div>
            <button
              onClick={() => buy(qty)}
              disabled={buyingQty !== null}
              className={`shrink-0 font-bold text-sm px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
                highlight ? s.buyFill : s.buyOutline
              }`}
            >
              {buyingQty === qty ? '...' : `${usd(p.totalCents)}${cur}`}
            </button>
          </div>
        )
      })}

      {/* Bulk buyers: any amount, ladder pricing down to the floor. */}
      {customOpen ? (
        <div className={`rounded-xl border p-4 ${s.customShell}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`font-black text-base ${s.title}`}>Custom amount</p>
              <p className={`text-xs mt-0.5 ${s.sub}`}>
                {usd(custom.unitCents)} per analysis
                {custom.savingsCents > 0 ? (
                  <span className={`font-bold ${s.save}`}> · save {usd(custom.savingsCents)} ({Math.round(custom.percentOff)}%)</span>
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
            className={`mt-3 w-full font-bold text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${s.customBuy}`}
          >
            {buyingQty === customQty ? '...' : `Buy ${customQty} tokens — ${usd(custom.totalCents)}${cur}`}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          className={`w-full rounded-xl p-4 flex items-center justify-between gap-3 text-left transition-colors ${s.customDashed}`}
        >
          <span className="min-w-0">
            <span className={`block font-black text-base ${s.title}`}>Custom amount</span>
            <span className={`block text-xs mt-0.5 ${s.sub}`}>
              Pick any number — as low as {usd(floorUnit)} per analysis at 15+
            </span>
          </span>
          <span className="shrink-0 text-ember-500 font-black text-xl" aria-hidden>＋</span>
        </button>
      )}

      {error ? <p className="text-red-500 text-xs">{error}</p> : null}

      <p className={`text-[11px] text-center ${s.note}`}>
        Best prices, any quantity — tokens bought here work everywhere, including the iPhone app.
      </p>
    </div>
  )
}
