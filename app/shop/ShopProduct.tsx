'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart'
import type { Variant, Size } from '@/lib/cart'
import QuantityStepper from '@/components/QuantityStepper'
import PremiumCTA from '@/components/PremiumCTA'

type Region = 'US' | 'CA'

const SIZES: { value: Size; inches: string; label: string }[] = [
  { value: '5', inches: '27.5"', label: 'Youth' },
  { value: '6', inches: '28.5"', label: "Women's" },
  { value: '7', inches: '29.5"', label: "Men's" },
]

const PRICE_USD = 49.99
// Bundle: ball 1 full price + ball 2 at 50% off = $49.99 + $25.00 = $74.99
const BUNDLE_USD = PRICE_USD + Math.round(PRICE_USD * 50) / 100

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
      <div className="max-w-5xl mx-auto space-y-14">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
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

            <PremiumCTA dark />

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

        {/* 2-Ball Bundle */}
        <BundleCard region={region} usdToCad={usdToCad} />
      </div>
    </section>
  )
}

function BundleCard({ region, usdToCad }: { region: Region; usdToCad: number }) {
  const { addBundle } = useCart()
  const [v1, setV1] = useState<Variant>('right')
  const [s1, setS1] = useState<Size>('7')
  const [v2, setV2] = useState<Variant>('right')
  const [s2, setS2] = useState<Size>('7')
  const [added, setAdded] = useState(false)

  const priceCad = Math.round(PRICE_USD * usdToCad * 100) / 100
  const ball2Cad = Math.round(priceCad * 50) / 100
  const bundleCad = Math.round((priceCad + ball2Cad) * 100) / 100
  const originalCad = Math.round(priceCad * 2 * 100) / 100

  const bundlePrice = region === 'CA' ? bundleCad : BUNDLE_USD
  const originalPrice = region === 'CA' ? originalCad : Math.round(PRICE_USD * 2 * 100) / 100
  const savings = Math.round((originalPrice - bundlePrice) * 100) / 100
  const currencyCode: 'USD' | 'CAD' = region === 'CA' ? 'CAD' : 'USD'

  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(false), 2500)
    return () => clearTimeout(t)
  }, [added])

  function handleAdd() {
    addBundle(v1, s1, v2, s2)
    setAdded(true)
  }

  return (
    <div className="rounded-2xl border border-orange-500/40 bg-orange-500/5 p-6 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center bg-orange-500 text-white text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full">
              Best Value
            </span>
            <span className="inline-flex items-center bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold px-3 py-1 rounded-full">
              15 Shot Analyses Included Free
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
            2-Ball Bundle
          </h2>
          <p className="text-zinc-400 text-sm">
            Get 2 training balls + 15 free AI shot analyses. Second ball 50% off.
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-white">
            {formatCurrency(bundlePrice, currencyCode)}{' '}
            <span className="text-sm font-medium text-zinc-400">{currencyCode}</span>
          </div>
          <div className="text-sm text-zinc-500 line-through">
            {formatCurrency(originalPrice, currencyCode)}
          </div>
          <div className="text-sm text-green-400 font-semibold">
            Save {formatCurrency(savings, currencyCode)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <BallPicker
          label="Ball 1"
          variant={v1}
          size={s1}
          onVariant={setV1}
          onSize={setS1}
        />
        <BallPicker
          label="Ball 2"
          badge="50% off"
          variant={v2}
          size={s2}
          onVariant={setV2}
          onSize={setS2}
        />
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <button
          onClick={handleAdd}
          className="bg-orange-500 hover:bg-red-600 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors w-full sm:w-auto"
        >
          Add Bundle to Cart — {formatCurrency(bundlePrice, currencyCode)}
        </button>

        {added && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3"
          >
            <span className="text-green-400 text-sm font-semibold">Added to cart</span>
            <Link
              href="/cart"
              className="text-orange-400 hover:text-orange-300 text-sm font-semibold underline"
            >
              View cart →
            </Link>
          </div>
        )}
      </div>

      <p className="text-zinc-500 text-xs">
        15 shot analysis credits will be added to your account automatically after purchase.
      </p>
    </div>
  )
}

function BallPicker({
  label,
  badge,
  variant,
  size,
  onVariant,
  onSize,
}: {
  label: string
  badge?: string
  variant: Variant
  size: Size
  onVariant: (v: Variant) => void
  onSize: (s: Size) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-white text-sm font-bold">{label}</span>
        {badge && (
          <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>

      <div>
        <label className="block text-zinc-400 text-xs font-semibold tracking-wider uppercase mb-1.5">Edition</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onVariant('right')}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
              variant === 'right'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="text-white font-semibold text-sm">Right</div>
            <div className="text-zinc-400 text-xs">Right-hand</div>
          </button>
          <button
            onClick={() => onVariant('left')}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
              variant === 'left'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className="text-white font-semibold text-sm">Left</div>
            <div className="text-zinc-400 text-xs">Left-hand</div>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-zinc-400 text-xs font-semibold tracking-wider uppercase mb-1.5">Size</label>
        <div className="grid grid-cols-3 gap-2">
          {SIZES.map((s) => (
            <button
              key={s.value}
              onClick={() => onSize(s.value)}
              className={`rounded-lg border-2 px-2 py-2 text-center transition-colors ${
                size === s.value
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="text-white font-semibold text-sm">Size {s.value}</div>
              <div className="text-zinc-400 text-xs">{s.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
