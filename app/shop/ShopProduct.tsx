'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart'
import QuantityStepper from '@/components/QuantityStepper'

type Variant = 'right' | 'left'
type Size = '5' | '6' | '7'
type Region = 'US' | 'CA'

const SIZES: { value: Size; inches: string; label: string }[] = [
  { value: '5', inches: '27.5"', label: 'Youth' },
  { value: '6', inches: '28.5"', label: "Women's" },
  { value: '7', inches: '29.5"', label: "Men's" },
]

const PRICE_USD = 49.99

function formatCurrency(amount: number, currency: 'USD' | 'CAD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

export default function ShopProduct({ usdToCad }: { usdToCad: number }) {
  const { addBall } = useCart()
  const [region, setRegion] = useState<Region>('US')
  const [variant, setVariant] = useState<Variant>('right')
  const [size, setSize] = useState<Size>('7')
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const priceCad = Math.round(PRICE_USD * usdToCad * 100) / 100
  const unitPrice = region === 'CA' ? priceCad : PRICE_USD
  const lineTotal = Math.round(unitPrice * quantity * 100) / 100
  const currencyCode: 'USD' | 'CAD' = region === 'CA' ? 'CAD' : 'USD'
  const displayUnit = formatCurrency(unitPrice, currencyCode)
  const displayLineTotal = formatCurrency(lineTotal, currencyCode)

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(false), 2500)
    return () => clearTimeout(t)
  }, [added])

  function handleAdd() {
    addBall(variant, size, quantity)
    setAdded(true)
  }

  return (
    <section className="flex-1 px-4 py-10 sm:py-16">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Video gallery */}
        <div className="space-y-3">
          <video
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 aspect-video"
            controls
            preload="metadata"
            playsInline
          >
            <source src="/ball-video-1.mp4#t=0.001" type="video/mp4" />
          </video>
          <video
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 aspect-video"
            controls
            preload="metadata"
            playsInline
          >
            <source src="/ball-video-2.mp4#t=0.001" type="video/mp4" />
          </video>
        </div>

        {/* Product details */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-1.5">
              <span className="text-green-500 text-xs font-semibold tracking-wider uppercase">In Stock</span>
            </div>
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

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight">
            The LearnHoops.com <span className="text-orange-500">Training Ball</span>
          </h1>

          <p className="text-white text-base leading-relaxed">
            Built with Maple Basketball for serious shooters. Choose the edition that matches your shooting hand
            so the grip lines guide your form.
          </p>

          <div className="text-3xl font-black text-white">
            {displayUnit} <span className="text-white text-sm font-medium">{currencyCode}</span>
          </div>

          {/* Variant selector */}
          <div className="space-y-2">
            <label className="block text-white text-xs font-semibold tracking-wider uppercase">Edition</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setVariant('right')}
                className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                  variant === 'right'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="text-white font-bold text-base">Right-handed</div>
                <div className="text-white text-xs mt-1">For right-hand shooters</div>
              </button>
              <button
                onClick={() => setVariant('left')}
                className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                  variant === 'left'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="text-white font-bold text-base">Left-handed</div>
                <div className="text-white text-xs mt-1">For left-hand shooters</div>
              </button>
            </div>
          </div>

          {/* Size selector */}
          <div className="space-y-2">
            <label className="block text-white text-xs font-semibold tracking-wider uppercase">Size</label>
            <div className="grid grid-cols-3 gap-3">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSize(s.value)}
                  className={`rounded-xl border-2 px-3 py-4 text-center transition-colors ${
                    size === s.value
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-white font-bold text-base">Size {s.value}</div>
                  <div className="text-white text-xs mt-1">{s.inches}</div>
                  <div className="text-white text-xs">{s.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <label className="block text-white text-xs font-semibold tracking-wider uppercase">Quantity</label>
            <QuantityStepper value={quantity} onChange={setQuantity} />
          </div>

          <button
            onClick={handleAdd}
            className="bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors w-full sm:w-auto"
          >
            Add to cart — {displayLineTotal}
          </button>

          {added && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3"
            >
              <span className="text-green-400 text-sm font-semibold">
                Added to cart
              </span>
              <Link
                href="/cart"
                className="text-orange-400 hover:text-orange-300 text-sm font-semibold underline"
              >
                View cart →
              </Link>
            </div>
          )}

          <p className="text-white text-xs">
            Secure checkout powered by Stripe. Shipping address collected at checkout.
          </p>
        </div>
      </div>
    </section>
  )
}
