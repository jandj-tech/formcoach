'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import type { StripeEmbeddedCheckoutShippingDetailsChangeEvent, ResultAction } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { useCart } from '@/lib/cart'
import type { CartItem } from '@/lib/cart'

// Module-level so the Stripe.js instance survives re-renders.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

export default function CheckoutClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { items, hydrated } = useCart()

  useEffect(() => {
    if (hydrated && items.length === 0) router.replace('/cart')
  }, [hydrated, items.length, router])

  if (!stripePromise) {
    return (
      <section className="flex-1 px-4 py-10 sm:py-16">
        <p className="text-red-500 max-w-3xl mx-auto">
          Checkout is not configured (missing Stripe publishable key).
        </p>
      </section>
    )
  }

  if (!hydrated || items.length === 0) {
    return (
      <section className="flex-1 px-4 py-10 sm:py-16">
        <p className="text-white max-w-3xl mx-auto">Loading checkout…</p>
      </section>
    )
  }

  return (
    <CheckoutFrame
      items={items}
      region={searchParams.get('region') === 'CA' ? 'CA' : 'US'}
      compCode={searchParams.get('compCode')?.trim() ?? ''}
    />
  )
}

// Mounted only once the cart is hydrated and non-empty. The session payload
// is snapshotted on mount: the Stripe iframe initializes with it exactly
// once, so later cart edits (in another tab) don't disturb the session.
function CheckoutFrame({ items, region, compCode }: { items: CartItem[]; region: 'US' | 'CA'; compCode: string }) {
  const [payload] = useState(() => ({
    region,
    ...(compCode ? { compCode } : {}),
    items: items.map((it) =>
      it.productSlug === 'bundle'
        ? {
            productSlug: 'bundle',
            variant1: it.variant1,
            size1: it.size1,
            variant2: it.variant2,
            size2: it.size2,
          }
        : {
            productSlug: it.productSlug,
            variant: it.variant,
            size: it.size,
            quantity: it.quantity,
          }
    ),
  }))
  const [error, setError] = useState('')

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok || !data.clientSecret) {
      const message = data.error || 'Checkout failed'
      setError(message)
      throw new Error(message)
    }
    return data.clientSecret as string
  }, [payload])

  // Fires when the buyer completes the address form: our server quotes live
  // carrier rates for that address and updates the session's shipping line.
  const onShippingDetailsChange = useCallback(
    async (event: StripeEmbeddedCheckoutShippingDetailsChangeEvent): Promise<ResultAction> => {
      try {
        const res = await fetch('/api/checkout/shipping-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkout_session_id: event.checkoutSessionId,
            shipping_details: event.shippingDetails,
          }),
        })
        const data = await res.json()
        if (data?.type === 'accept') return { type: 'accept' }
        return {
          type: 'reject',
          errorMessage: data?.errorMessage || 'Could not calculate shipping for that address.',
        }
      } catch {
        return { type: 'reject', errorMessage: 'Could not calculate shipping. Please try again.' }
      }
    },
    []
  )

  return (
    <section className="flex-1 px-4 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl sm:text-3xl font-black text-white">Checkout</h1>
        <p className="text-zinc-400 text-sm">
          Shipping is calculated once you enter your address.
        </p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="rounded-2xl overflow-hidden bg-white">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret, onShippingDetailsChange }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </section>
  )
}
