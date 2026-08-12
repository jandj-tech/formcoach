'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIsInApp } from '@/lib/useIsInApp'
import { trackInitiateCheckout } from '@/lib/meta-pixel'

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
    trackInitiateCheckout()
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: resultsPath }),
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
        <button
          onClick={buy}
          disabled={loading}
          className="bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          {loading ? 'Opening checkout…' : 'Buy Shot Analysis Token →'}
        </button>
      )}
    </div>
  )
}
