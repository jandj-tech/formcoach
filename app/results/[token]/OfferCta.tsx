'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import { trackInitiateCheckout } from '@/lib/meta-pixel'

// Purchase UI for org-released results. Two modes:
//   'unlock' — centered card over the gated section, selling everything the
//              org offers (any purchase that includes the breakdown unlocks it)
//   'strip'  — "From your club" product cards under a fully-visible report
//              (ball / class offers stay for sale after an unlock)
//
// Prices come pre-resolved from the server (the org's own offer rows). Inside
// the iOS app no prices and no checkout are shown at all (guideline 3.1.1) —
// the same rule UnlockCta follows.

export interface OfferCtaOffer {
  id: string
  kind: 'breakdown' | 'ball' | 'course' | 'bundle'
  title: string
  description: string | null
  priceCents: number
  regularPriceCents: number
  hasAnchor: boolean
  includesBall: boolean
  includesBreakdown: boolean
  unlockScope: 'submission' | 'player'
  shippingCents: number
}

const SIZES = [
  { value: '5', label: 'Size 5 · 27.5"' },
  { value: '6', label: 'Size 6 · 28.5"' },
  { value: '7', label: 'Size 7 · 29.5"' },
] as const

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function OfferCta({
  token,
  orgId,
  offers,
  orgName,
  mode,
  justPurchased,
  previewNote,
}: {
  /** Results token the buyer arrived from; empty for a standalone offers page. */
  token: string
  /** Org id for standalone purchases (no results link). */
  orgId?: string
  offers: OfferCtaOffer[]
  orgName: string
  mode: 'unlock' | 'strip'
  justPurchased: boolean
  previewNote?: string
}) {
  const inApp = useIsInApp()
  const router = useRouter()
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [size, setSize] = useState<string>('7')
  const [variant, setVariant] = useState<'right' | 'left'>('right')
  const [error, setError] = useState<string | null>(null)
  // Right after checkout the webhook that unlocks the report can lag the
  // redirect by a few seconds — poll a few refreshes before giving up.
  const [waiting, setWaiting] = useState(justPurchased)
  const triesRef = useRef(0)
  // Labelled, not chosen: the server decides the currency from the request.
  const [currency, setCurrency] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/region')
      .then((r) => r.json())
      .then(({ currency: c }) => setCurrency(typeof c === 'string' ? c : null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!justPurchased) return
    const interval = setInterval(() => {
      triesRef.current += 1
      if (triesRef.current > 6) {
        setWaiting(false)
        clearInterval(interval)
        return
      }
      router.refresh()
    }, 2000)
    return () => clearInterval(interval)
  }, [justPurchased, router])

  async function buy(offer: OfferCtaOffer) {
    if (offer.includesBall && expandedId !== offer.id) {
      // First tap on a ball offer opens the size/hand picker instead of
      // charging for a ball whose size nobody chose.
      setExpandedId(offer.id)
      return
    }
    setBuyingId(offer.id)
    setError(null)
    trackInitiateCheckout((offer.priceCents + (offer.includesBall ? offer.shippingCents : 0)) / 100)
    try {
      const res = await fetch('/api/offer-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(token ? { token } : { orgId }),
          offerId: offer.id,
          ...(offer.includesBall ? { size, variant } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.assign(data.url)
        return
      }
      setError(typeof data.error === 'string' ? data.error : 'Checkout is unavailable right now.')
    } catch {
      setError('Checkout is unavailable right now.')
    }
    setBuyingId(null)
  }

  if (offers.length === 0) return null

  if (inApp) {
    // No prices, no packs, no checkout inside the app (guideline 3.1.1).
    if (mode === 'strip') return null
    return (
      <div className="flex flex-col items-center gap-2 bg-white border border-gray-200 shadow-xl rounded-2xl px-6 py-5 max-w-xs text-center">
        <div className="text-3xl" aria-hidden>🔒</div>
        <p className="text-black font-black text-base leading-snug">
          Your full report is available on the web
        </p>
        <p className="text-gray-500 text-xs leading-relaxed">
          Open your results link in a web browser to see everything {orgName} has shared with you.
        </p>
      </div>
    )
  }

  const cards = (
    <div className={mode === 'unlock' ? 'w-full flex flex-col gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
      {offers.map((o) => {
        const total = o.priceCents + (o.includesBall ? o.shippingCents : 0)
        const expanded = o.includesBall && expandedId === o.id
        return (
          <div
            key={o.id}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-black leading-snug">{o.title}</p>
                {o.description && (
                  <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{o.description}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                {o.hasAnchor && (
                  <span className="block text-[11px] text-gray-400 line-through">
                    {money(o.regularPriceCents)}
                  </span>
                )}
                <span className="block text-base font-black text-black leading-none">
                  {money(o.priceCents)}
                </span>
                {o.includesBall && o.shippingCents > 0 && (
                  <span className="block text-[10px] text-gray-400 mt-0.5">
                    + {money(o.shippingCents)} shipping
                  </span>
                )}
              </div>
            </div>
            {expanded && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ball size">
                  {SIZES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={size === s.value}
                      onClick={() => setSize(s.value)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        size === s.value
                          ? 'border-orange-500 bg-orange-50 text-black'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Shooting hand">
                  {(['right', 'left'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={variant === v}
                      onClick={() => setVariant(v)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold capitalize transition-colors ${
                        variant === v
                          ? 'border-orange-500 bg-orange-50 text-black'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {v}-handed
                    </button>
                  ))}
                </div>
              </div>
            )}
            {o.includesBreakdown && (
              <p className="mt-2 text-[11px] text-gray-500">
                {o.unlockScope === 'player'
                  ? `Unlocks the full breakdown on every report ${orgName} sends you.`
                  : 'Unlocks the full breakdown on this shot report.'}
              </p>
            )}
            <button
              onClick={() => buy(o)}
              disabled={buyingId !== null}
              className="mt-3 w-full bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-ink-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors"
            >
              {buyingId === o.id
                ? 'Opening checkout…'
                : o.includesBall && !expanded
                  ? `Choose ball & buy — ${money(total)}${currency ? ` ${currency}` : ''}`
                  : `Buy — ${money(total)}${currency ? ` ${currency}` : ''}`}
            </button>
          </div>
        )
      })}
    </div>
  )

  if (mode === 'strip') {
    return (
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-black font-black text-lg sm:text-xl">From {orgName}</h2>
        </div>
        {previewNote && <p className="text-xs text-gray-400">{previewNote}</p>}
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        {cards}
      </section>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2.5 bg-white border border-gray-200 shadow-xl rounded-2xl px-5 py-5 w-full max-w-sm text-center">
      <div className="text-3xl" aria-hidden>🔒</div>
      <p className="text-black font-black text-base leading-snug">
        Unlock your full report
      </p>
      <p className="text-gray-500 text-xs leading-relaxed">
        {orgName} shared your score. Every option below includes the complete
        breakdown of your shot and exactly how to fix it.
      </p>
      {previewNote && <p className="text-[11px] font-bold text-indigo-600">{previewNote}</p>}
      {waiting ? (
        <p className="text-orange-600 text-xs font-bold animate-pulse">
          Payment received — unlocking your full report…
        </p>
      ) : (
        <>
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          {cards}
        </>
      )}
    </div>
  )
}
