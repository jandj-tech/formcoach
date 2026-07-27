'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { trackInitiateCheckout } from '@/lib/meta-pixel'

type Region = 'US' | 'CA'

const TOKENS = 5
const PRICE = 10
const REGULAR_EACH = 2.79

// One-time new-account offer: 5 analysis tokens for $10. The modal auto-opens
// right after signup (?welcome=1); the banner stays while the offer is live.
export default function StarterOfferPopup({ eligible }: { eligible: boolean }) {
  const searchParams = useSearchParams()
  const purchased = searchParams.get('starter') === '1'
  const welcome = searchParams.get('welcome') === '1'

  // Auto-open right after signup (?welcome=1); afterwards the banner remains.
  const [open, setOpen] = useState(() => welcome && eligible && !purchased)
  const [region, setRegion] = useState<Region>('US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!eligible) return
    fetch('/api/region').then(r => r.json()).then(({ region }) => setRegion(region)).catch(() => {})
  }, [eligible])

  async function handleClaim() {
    trackInitiateCheckout()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/starter-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.url) {
        window.location.href = data.url
        return
      }
      setLoading(false)
      setError(data.error || 'Could not start checkout. Please try again.')
    } catch {
      setLoading(false)
      setError('Could not start checkout. Please try again.')
    }
  }

  if (purchased) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-300 bg-green-50 px-4 py-3">
        <span className="text-xl select-none" aria-hidden>🎉</span>
        <p className="text-sm text-green-800">
          <span className="font-bold">Starter pack purchased!</span> Your {TOKENS} analysis tokens
          are being added to your account — refresh in a moment if you don&apos;t see them yet.
        </p>
      </div>
    )
  }

  if (!eligible) return null

  const savingsPct = Math.round((1 - PRICE / (TOKENS * REGULAR_EACH)) * 100)

  return (
    <>
      {/* Persistent banner while the offer window is open */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-black">
            🏀 New player offer: {TOKENS} shot analyses for ${PRICE}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            One-time deal for new accounts — save {savingsPct}% vs ${REGULAR_EACH.toFixed(2)} each.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 bg-orange-500 hover:bg-orange-400 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
        >
          Claim Offer →
        </button>
      </div>

      {/* Welcome modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="New player offer"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-center">
            <div className="text-5xl select-none" aria-hidden>🏀</div>
            <div className="space-y-1">
              <p className="text-xs font-bold tracking-wider uppercase text-orange-500">
                One-time new player offer
              </p>
              <h2 className="text-2xl font-black text-black leading-tight">
                {TOKENS} shot analyses for ${PRICE}
              </h2>
              <p className="text-sm text-gray-600">
                That&apos;s ${(PRICE / TOKENS).toFixed(2)} per analysis instead of ${REGULAR_EACH.toFixed(2)} —
                only available while your account is brand new.
              </p>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleClaim}
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {loading ? 'Starting checkout...' : `Get ${TOKENS} for $${PRICE} →`}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="w-full text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              No thanks
            </button>
          </div>
        </div>
      )}
    </>
  )
}
