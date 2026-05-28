'use client'

import { useEffect } from 'react'
import { useCart } from '@/lib/cart'

export default function ClearCart({ sessionId }: { sessionId?: string }) {
  const { clear, hydrated } = useCart()

  useEffect(() => {
    if (hydrated) clear()
  }, [hydrated, clear])

  // Safety net for the free-analysis grant. The webhook is the primary path;
  // calling claim-credits here covers cases where the webhook was missed
  // (signature mismatch, dropped delivery). Idempotent server-side.
  useEffect(() => {
    if (!sessionId) return
    fetch('/api/shop/claim-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {})
  }, [sessionId])

  return null
}
