'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useAnalysisPrice } from '@/lib/useAnalysisPrice'
import { orderPricing, percentLabel, usd } from '@/lib/team-pricing'

// Three one-tap choices rather than a stepper: this is the moment someone
// decides whether to buy at all, and asking them to operate a control first is
// how you end up selling exactly one every time.
// No pack between the single and the 5-token volume step: under the
// $9.99/$5.00 ladder a 3-pack ($29.97) costs more than a 5-pack ($25.00).
const PACKS = [1, 5, 10] as const

// CTA card shown on top of the blurred criteria breakdown of a free-preview
// report. Buying sends the player through the normal token checkout and back
// to this results page, where the server unlocks the report.
export default function UnlockCta({ resultsPath, justPurchased }: { resultsPath: string; justPurchased: boolean }) {
  const inApp = useIsInApp()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // Right after checkout the webhook that grants the token can lag the
  // redirect by a few seconds — poll a few refreshes before giving up and
  // showing the buy button again.
  const [waiting, setWaiting] = useState(justPurchased)
  const triesRef = useRef(0)
  const [qty, setQty] = useState<number>(1)
  // Labelled, not chosen: the server decides the currency from the request. This
  // only tells the buyer which one they're about to see on the Stripe page.
  const [currency, setCurrency] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/region')
      .then((r) => r.json())
      .then(({ currency: c }) => setCurrency(typeof c === 'string' ? c : null))
      .catch(() => {})
  }, [])

  // The viewer's own rate, not the report owner's. A results link is shareable,
  // and /api/buy-token charges whoever is signed in here — so this hook is the
  // only source that agrees with what the card will actually be billed.
  const { tier, baseUnitCents } = useAnalysisPrice()
  const selected = orderPricing(tier, qty)

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

  async function buy() {
    setLoading(true)
    trackInitiateCheckout(selected.totalCents / 100)
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: resultsPath, quantity: qty }),
      })
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(resultsPath)}`
        return
      }
      const { url } = await res.json()
      if (url) {
        window.location.href = url
        return
      }
    } catch {}
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center gap-2.5 bg-white border border-gray-200 shadow-xl rounded-2xl px-6 py-5 max-w-xs text-center">
      <div className="text-3xl" aria-hidden>🔒</div>
      <p className="text-black font-black text-base leading-snug">
        Buy a Shot Analysis Token to see everything
      </p>
      <p className="text-gray-500 text-xs leading-relaxed">
        Your free analysis includes the overall score. Unlock every criterion&apos;s
        grade, the coaching notes on your form, and how to fix each one.
      </p>
      {waiting ? (
        <p className="text-orange-600 text-xs font-bold animate-pulse">
          Payment received — unlocking your full report…
        </p>
      ) : inApp ? (
        // Stripe checkout is not allowed inside the iOS app (guideline 3.1.1);
        // tokens are bought there via native in-app purchase on the Analyze tab.
        <p className="text-gray-600 text-xs font-semibold">
          Buy a token on the Analyze tab to unlock this report.
        </p>
      ) : (
        // Everything price-related lives inside this arm on purpose. The
        // in-app branch above must show no prices and no packs at all —
        // pointing an iOS user at a cheaper purchase elsewhere is exactly the
        // signposting App Store guideline 3.1.1 objects to.
        <>
          <div
            role="radiogroup"
            aria-label="How many analyses"
            className="w-full flex flex-col gap-1.5"
          >
            {PACKS.map((n) => {
              const pack = orderPricing(tier, n)
              const active = qty === n
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setQty(n)}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                        active ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                      }`}
                      aria-hidden
                    />
                    <span className="text-sm font-bold text-black">
                      {n === 1 ? '1 analysis' : `${n} analyses`}
                    </span>
                    {pack.percentOff > 0 && (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                        save {percentLabel(pack.percentOff)}%
                      </span>
                    )}
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-black text-black leading-none">
                      {usd(pack.totalCents)}
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {usd(pack.unitCents)} each
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={buy}
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-ink-950 font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
          >
            {loading
              ? 'Opening checkout…'
              : `Unlock — ${usd(selected.totalCents)}${currency ? ` ${currency}` : ''}`}
          </button>

          <p className="text-gray-400 text-[11px] leading-relaxed">
            {qty > 1
              ? `Unlocks this report now. The other ${qty - 1} wait in your account for your next shots — they never expire.`
              : 'Unlocks this report now, and never expires.'}
          </p>
        </>
      )}
    </div>
  )
}
