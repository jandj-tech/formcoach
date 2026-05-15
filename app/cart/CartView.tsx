'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trash2Icon } from 'lucide-react'
import { useCart, type CartItem, type Variant, type Size } from '@/lib/cart'
import QuantityStepper from '@/components/QuantityStepper'

type Region = 'US' | 'CA'

const PRICE_USD = 49.99

const SIZE_INCHES: Record<Size, string> = {
  '5': '27.5"',
  '6': '28.5"',
  '7': '29.5"',
}

function formatCurrency(amount: number, currency: 'USD' | 'CAD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function variantLabel(v: Variant) {
  return v === 'left' ? 'Left-handed' : 'Right-handed'
}

export default function CartView({ usdToCad }: { usdToCad: number }) {
  const { items, hydrated, setQuantity, removeItem } = useCart()
  const [region, setRegion] = useState<Region>('US')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const unitPrice = region === 'CA' ? Math.round(PRICE_USD * usdToCad * 100) / 100 : PRICE_USD
  const currencyCode: 'USD' | 'CAD' = region === 'CA' ? 'CAD' : 'USD'

  const subtotal = items.reduce((sum, it) => sum + unitPrice * ('quantity' in it ? it.quantity : 1), 0)
  const subtotalRounded = Math.round(subtotal * 100) / 100

  async function handleCheckout() {
    if (items.length === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region,
          items: items.map((it) => ({
            productSlug: it.productSlug,
            variant: it.variant,
            size: it.size,
            quantity: it.quantity,
          })),
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-black text-white">Your cart</h1>
          <div
            role="group"
            aria-label="Currency"
            className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-full p-1"
          >
            <button
              type="button"
              onClick={() => setRegion('US')}
              aria-pressed={region === 'US'}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                region === 'US' ? 'bg-orange-500 text-white' : 'text-white hover:bg-zinc-800'
              }`}
            >
              <span aria-hidden className="text-sm leading-none">🇺🇸</span>
              USD
            </button>
            <button
              type="button"
              onClick={() => setRegion('CA')}
              aria-pressed={region === 'CA'}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                region === 'CA' ? 'bg-orange-500 text-white' : 'text-white hover:bg-zinc-800'
              }`}
            >
              <span aria-hidden className="text-sm leading-none">🇨🇦</span>
              CAD
            </button>
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {items.map((it) => (
            <CartLine
              key={it.id}
              item={it}
              unitPrice={unitPrice}
              currencyCode={currencyCode}
              onChangeQty={(q) => setQuantity(it.id, q)}
              onRemove={() => removeItem(it.id)}
            />
          ))}
        </ul>

        <div className="border-t border-zinc-800 pt-5 flex items-center justify-between gap-3">
          <span className="text-white text-base">Subtotal</span>
          <span className="text-white text-2xl font-black">
            {formatCurrency(subtotalRounded, currencyCode)}{' '}
            <span className="text-white text-xs font-medium">{currencyCode}</span>
          </span>
        </div>

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors w-full"
        >
          {loading
            ? 'Redirecting to checkout…'
            : `Checkout — ${formatCurrency(subtotalRounded, currencyCode)}`}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <p className="text-white text-xs">
          Shipping calculated at checkout. Secure payment by Stripe.
        </p>
      </div>
    </section>
  )
}

function CartLine({
  item,
  unitPrice,
  currencyCode,
  onChangeQty,
  onRemove,
}: {
  item: CartItem
  unitPrice: number
  currencyCode: 'USD' | 'CAD'
  onChangeQty: (q: number) => void
  onRemove: () => void
}) {
  const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex-1 min-w-0">
        <div className="text-white font-bold text-base">
          The LearnHoops.com Training Ball
        </div>
        <div className="text-white text-sm mt-1">
          {variantLabel(item.variant)} · Size {item.size} ({SIZE_INCHES[item.size]})
        </div>
        <div className="text-white text-xs mt-1">
          {formatCurrency(unitPrice, currencyCode)} each
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
          {formatCurrency(lineTotal, currencyCode)}
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
