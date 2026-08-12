'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Trash2Icon } from 'lucide-react'
import { useCart } from '@/lib/cart'
import type { CartBallItem, CartBundleItem, Variant, Size } from '@/lib/cart'
import QuantityStepper from '@/components/QuantityStepper'
import { useIsInApp } from '@/lib/useIsInApp'

const PRICE = 39.99
// Bundle: ball 1 full price + ball 2 at 50% off = $39.99 + $20.00 = $59.99
const BUNDLE_PRICE = PRICE + Math.round(PRICE * 50) / 100
// Free shot analyses granted per single training ball.
const FREE_ANALYSES_PER_BALL = 5

const SIZE_INCHES: Record<Size, string> = {
  '5': '27.5"',
  '6': '28.5"',
  '7': '29.5"',
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function variantLabel(v: Variant) {
  return v === 'left' ? 'Left-handed' : 'Right-handed'
}

export default function CartView() {
  const inApp = useIsInApp()
  const { items, hydrated, setQuantity, removeItem } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Logged-in account type — drives the "your credits will land here" hint.
  const [account, setAccount] = useState<{ type: string } | null>(null)
  const [compCode, setCompCode] = useState('')
  // Buyer's region decides the checkout currency (CAD for Canada, else USD).
  // Was hard-coded to 'US', which billed Canadian buyers in USD.
  const [region, setRegion] = useState<'US' | 'CA'>('US')

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(({ account }) => {
        setAccount(account ?? null)
      })
      .catch(() => {})
    fetch('/api/region')
      .then(r => r.json())
      .then(({ region }) => {
        if (region === 'CA') setRegion('CA')
      })
      .catch(() => {})
  }, [])

  const subtotal = items.reduce<number>((sum, it) => {
    if (it.productSlug === 'bundle') return sum + BUNDLE_PRICE
    return sum + PRICE * it.quantity
  }, 0)
  const subtotalRounded = Math.round(subtotal * 100) / 100

  function handleCheckout() {
    if (items.length === 0) return
    setLoading(true)
    setError('')
    // The /checkout page reads the cart from localStorage itself and renders
    // the embedded Stripe checkout, where shipping is quoted live from the
    // entered address. Region and comp code travel via query params.
    const params = new URLSearchParams({ region })
    if (compCode.trim()) params.set('compCode', compCode.trim())
    window.location.href = `/checkout?${params.toString()}`
  }

  if (!hydrated) {
    return (
      <section className="flex-1 px-4 py-10 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-white">Loading cart…</p>
        </div>
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="flex-1 px-4 py-10 sm:py-16">
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <div className="text-6xl">🛒</div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">Your cart is empty</h1>
          <p className="text-white">Browse the shop and add some balls.</p>
          <Link
            href="/shop"
            className="inline-block bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-3 rounded-xl text-sm transition-colors"
          >
            Go to shop
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="flex-1 px-4 py-10 sm:py-16">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <h1 className="text-3xl sm:text-4xl font-black text-white">Your cart</h1>

        <ul className="flex flex-col gap-3">
          {items.map((it) =>
            it.productSlug === 'bundle' ? (
              <BundleCartLine
                key={it.id}
                item={it}
                bundlePrice={BUNDLE_PRICE}
                onRemove={() => removeItem(it.id)}
              />
            ) : (
              <BallCartLine
                key={it.id}
                item={it}
                unitPrice={PRICE}
                onChangeQty={(q) => setQuantity(it.id, q)}
                onRemove={() => removeItem(it.id)}
              />
            )
          )}
        </ul>

        <div className="border-t border-zinc-800 pt-5 flex items-center justify-between gap-3">
          <span className="text-white text-base">Subtotal</span>
          <span className="text-white text-2xl font-black">
            {formatPrice(subtotalRounded)}
          </span>
        </div>

        {account && !inApp && (
          <p className="text-zinc-400 text-xs">
            Free analyses go to your{' '}
            {account.type === 'org'
              ? 'organization balance'
              : account.type === 'team'
                ? 'coach credits'
                : 'account'}
            . You can transfer them to a team or players later from your dashboard.
          </p>
        )}

        {!inApp && (
        <div className="flex flex-col gap-1">
          <label className="text-zinc-400 text-xs font-semibold">Promo / comp code (optional)</label>
          <input
            type="text"
            value={compCode}
            onChange={(e) => setCompCode(e.target.value.toUpperCase())}
            placeholder="Enter a code"
            className="bg-zinc-950 border border-zinc-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500 placeholder-zinc-600"
          />
          <p className="text-zinc-500 text-xs">A valid comp code makes the order free — no card needed.</p>
        </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors w-full"
        >
          {loading
            ? 'Opening checkout…'
            : `Checkout — ${formatPrice(subtotalRounded)}`}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <p className="text-white text-xs">
          Shipping calculated from your address at checkout. Secure payment by Stripe.
        </p>
      </div>
    </section>
  )
}

function BallCartLine({
  item,
  unitPrice,
  onChangeQty,
  onRemove,
}: {
  item: CartBallItem
  unitPrice: number
  onChangeQty: (q: number) => void
  onRemove: () => void
}) {
  const inApp = useIsInApp()
  const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <div className="text-white font-bold text-base">The LearnHoops Training Ball</div>
          {!inApp && (
            <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
              + {FREE_ANALYSES_PER_BALL * item.quantity} Shot Analyses Free
            </span>
          )}
        </div>
        <div className="text-white text-sm">
          {variantLabel(item.variant)} · Size {item.size} ({SIZE_INCHES[item.size]})
        </div>
        <div className="text-white text-xs mt-1">
          {formatPrice(unitPrice)} each
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <QuantityStepper
          value={item.quantity}
          onChange={onChangeQty}
          ariaLabel={`Quantity for ${variantLabel(item.variant)} size ${item.size}`}
          size="sm"
        />
        <div className="text-white font-bold min-w-[5rem] text-right">
          {formatPrice(lineTotal)}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from cart"
          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-white hover:bg-zinc-900 hover:text-red-400 transition-colors"
        >
          <Trash2Icon className="h-5 w-5" />
        </button>
      </div>
    </li>
  )
}

function BundleCartLine({
  item,
  bundlePrice,
  onRemove,
}: {
  item: CartBundleItem
  bundlePrice: number
  onRemove: () => void
}) {
  const inApp = useIsInApp()
  return (
    <li className="flex flex-col sm:flex-row sm:items-start gap-4 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <div className="text-white font-bold text-base">2-Ball Bundle</div>
          {!inApp && (
            <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full">
              + 10 Shot Analyses Free
            </span>
          )}
        </div>
        <div className="text-zinc-400 text-sm">
          Ball 1: {variantLabel(item.variant1)} · Size {item.size1} ({SIZE_INCHES[item.size1]})
        </div>
        <div className="text-zinc-400 text-sm">
          Ball 2: {variantLabel(item.variant2)} · Size {item.size2} ({SIZE_INCHES[item.size2]}){' '}
          <span className="text-green-400">50% off</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:gap-4 sm:self-center">
        <div className="text-white font-bold min-w-[5rem] text-right">
          {formatPrice(bundlePrice)}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove bundle from cart"
          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-white hover:bg-zinc-900 hover:text-red-400 transition-colors"
        >
          <Trash2Icon className="h-5 w-5" />
        </button>
      </div>
    </li>
  )
}
