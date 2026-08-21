'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// Slim utility bar under the nav for logged-in players who are out of
// analysis tokens: one line, one action, dismissible for the session —
// the announcement-bar pattern, never stacked with anything else.
// Hidden on the shop (it IS the destination) and on auth/checkout pages.
const HIDDEN_PREFIXES = ['/shop', '/login', '/signup', '/cart', '/forgot-password', '/reset-password', '/unsubscribe']

export default function TokenBanner({ pathname, inApp = false }: { pathname: string; inApp?: boolean }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return
    try {
      if (sessionStorage.getItem('lh-token-banner-dismissed')) return
    } catch {}
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(({ user }) => {
        // Players only, signed in, no tokens, no active sub, free analysis used.
        if (user && !user.subscribed && user.tokens === 0 && !user.freeUpload) setShow(true)
      })
      .catch(() => {})
  }, [pathname])

  if (!show) return null

  function dismiss() {
    setShow(false)
    try {
      sessionStorage.setItem('lh-token-banner-dismissed', '1')
    } catch {}
  }

  const body = (
    <span className="text-xs sm:text-sm font-semibold text-chalk">
      🏀 You&rsquo;re out of analysis tokens
      {inApp ? (
        <span className="text-chalk-dim"> — get more in the Shop tab</span>
      ) : (
        <span className="text-ember-400"> — get more in the shop →</span>
      )}
    </span>
  )

  return (
    <div className="border-t border-b border-ember-500/30 bg-ember-500/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
        {inApp ? body : (
          <Link href="/shop#analysis-tokens" className="min-w-0 hover:opacity-90">
            {body}
          </Link>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-chalk-dim hover:text-chalk text-sm font-bold px-1"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
