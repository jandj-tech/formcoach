'use client'

import { useEffect, useRef, useState } from 'react'
import { trackPurchase } from '@/lib/meta-pixel'

/**
 * The browser half of the Purchase conversion.
 *
 * The Stripe webhook already sends this purchase to Meta's Conversions API
 * (lib/meta-server.ts) keyed on the SAME id — the checkout session id — so the
 * two collapse into one conversion rather than double-counting. The browser
 * copy is worth firing anyway: it carries the visitor's own _fbp/_fbc cookies
 * natively, and it still reports if a webhook delivery is ever missed.
 *
 * Fires once per mount; a $0 comp order sends nothing (trackPurchase drops it).
 */
export default function PurchasePixel({
  value,
  currency,
  eventId,
}: {
  value: number
  currency: string
  eventId: string
}) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackPurchase({ value, currency, content_type: 'product' }, eventId)
  }, [value, currency, eventId])

  return null
}

/**
 * Same event, for the success pages that only know the session id: a guest ball
 * buyer who lands on /signup to claim their analyses, and a new subscriber
 * landing on /dashboard. The amount is read back from Stripe rather than passed
 * in the URL, so a hand-edited link cannot invent a conversion value.
 *
 * `onPaid` runs once the session is confirmed paid — /signup uses it to clear
 * the cart, which otherwise stays full for every guest who buys.
 */
export function PurchasePixelFromSession({
  sessionId,
  onPaid,
}: {
  sessionId: string
  onPaid?: () => void
}) {
  const [paid, setPaid] = useState<{ value: number; currency: string; eventId: string } | null>(null)
  const asked = useRef(false)
  const notified = useRef(false)

  useEffect(() => {
    if (asked.current) return
    asked.current = true
    let live = true
    fetch(`/api/checkout/summary?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (live && d?.paid) setPaid({ value: d.value, currency: d.currency, eventId: d.eventId })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [sessionId])

  useEffect(() => {
    if (paid && onPaid && !notified.current) {
      notified.current = true
      onPaid()
    }
  }, [paid, onPaid])

  if (!paid) return null
  return <PurchasePixel value={paid.value} currency={paid.currency} eventId={paid.eventId} />
}
