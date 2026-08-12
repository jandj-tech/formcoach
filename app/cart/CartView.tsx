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

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
  'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

type EstimateQuote = {
  displayName: string
  amountCents: number
  currency: string
  estDaysMin?: number
  estDaysMax?: number
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatCents(cents: number, currency: string): string {
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
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
  // Destination for the shipping estimate. The country decides the checkout
  // currency (CAD for Canada, else USD); the state / postal code decides the
  // shipping zone. Country is pre-filled from the visitor's region.
  const [country, setCountry] = useState<'US' | 'CA'>('US')
  const [usState, setUsState] = useState('')
  const [postal, setPostal] = useState('')
  // Estimate keyed by the inputs that produced it, so a stale response for
  // an old destination is never displayed.
  const [estimate, setEstimate] = useState<{ key: string; quotes: EstimateQuote[] } | null>(null)

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
        if (region === 'CA') setCountry('CA')
      })
      .catch(() => {})
  }, [])

  const subtotal = items.reduce<number>((sum, it) => {
    if (it.productSlug === 'bundle') return sum + BUNDLE_PRICE
    return sum + PRICE * it.quantity
  }, 0)
  const subtotalRounded = Math.round(subtotal * 100) / 100

  const ballCount = items.reduce<number>(
    (sum, it) => sum + (it.productSlug === 'bundle' ? 2 : it.quantity),
    0
  )
  const destReady = country === 'US' ? /^[A-Z]{2}$/.test(usState) : /^[A-Za-z]/.test(postal.trim())
  const estimateKey = `${country}|${usState}|${postal.trim().toUpperCase()}|${ballCount}`
  const quotes = estimate?.key === estimateKey ? estimate.quotes : null

  useEffect(() => {
    if (!destReady || ballCount === 0) return
    const key = estimateKey
    const t = setTimeout(() => {
      fetch('/api/shipping-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          state: usState || undefined,
          postalCode: postal.trim() || undefined,
          ballCount,
        }),
      })
        .then(r => r.json())
        .then((data) => {
          if (Array.isArray(data?.quotes)) setEstimate({ key, quotes: data.quotes })
        })
        .catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [destReady, ballCount, country, usState, postal, estimateKey])

  async function handleCheckout() {
    if (items.length === 0 || !destReady) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: country,
          shipTo: { country, state: usState, postalCode: postal.trim() },
          ...(compCode.trim() ? { compCode: compCode.trim() } : {}),
          items: items.map((it) => {
            if (it.productSlug === 'bundle') {
              return {
                productSlug: 'bundle',
                variant1: it.variant1,
                size1: it.size1,
                variant2: it.variant2,
                size2: it.size2,
              }
            }
            return {
              productSlug: it.productSlug,
              variant: it.variant,
              size: it.size,
              quantity: it.quantity,
            }
          }),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed')
      window.location.href = data.url
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
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

        {/* Shipping estimator — the destination entered here prices the
            shipping options the buyer picks from at Stripe checkout. */}
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-white text-sm font-bold">Shipping</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-semibold">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value === 'CA' ? 'CA' : 'US')}
                className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-500"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </div>
            {country === 'US' ? (
              <div className="flex flex-col gap-1">
                <label className="text-zinc-400 text-xs font-semibold">State</label>
                <select
                  value={usState}
                  onChange={(e) => setUsState(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select state…</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-zinc-400 text-xs font-semibold">Postal code</label>
                <input
                  type="text"
                  value={postal}
                  onChange={(e) => setPostal(e.target.value.toUpperCase())}
                  placeholder="e.g. L4K 2N6"
                  maxLength={7}
                  className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-500 placeholder-zinc-600"
                />
              </div>
            )}
          </div>
          {!destReady ? (
            <p className="text-zinc-500 text-xs">
              {country === 'US' ? 'Select your state' : 'Enter your postal code'} to see shipping.
            </p>
          ) : quotes ? (
            <div className="space-y-1.5">
              {quotes.map((q) => (
                <div key={q.displayName} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">
                    {q.displayName}
                    {q.estDaysMin && q.estDaysMax && (
                      <span className="text-zinc-500"> · {q.estDaysMin}–{q.estDaysMax} business days</span>
                    )}
                  </span>
                  <span className="text-white font-semibold">{formatCents(q.amountCents, q.currency)}</span>
                </div>
              ))}
              <p className="text-zinc-500 text-xs pt-1">
                You&apos;ll pick your shipping speed at checkout. Estimated total with standard shipping:{' '}
                <span className="text-zinc-300 font-semibold">
                  {formatCents(Math.round(subtotalRounded * 100) + quotes[0].amountCents, quotes[0].currency)}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-zinc-500 text-xs">Calculating shipping…</p>
          )}
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
          disabled={loading || !destReady}
          className="bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors w-full"
        >
          {loading
            ? 'Redirecting to checkout…'
            : destReady
              ? `Checkout — ${formatPrice(subtotalRounded)} + shipping`
              : country === 'US'
                ? 'Select your state to checkout'
                : 'Enter your postal code to checkout'}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <p className="text-white text-xs">
          Orders ship Canada Post within Canada and USPS within the US. Secure payment by Stripe.
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
