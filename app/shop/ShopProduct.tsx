'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCart } from '@/lib/cart'
import type { Variant, Size } from '@/lib/cart'
import QuantityStepper from '@/components/QuantityStepper'
import PremiumCTA from '@/components/PremiumCTA'

const SIZES: { value: Size; inches: string; label: string }[] = [
  { value: '5', inches: '27.5"', label: 'Youth' },
  { value: '6', inches: '28.5"', label: "Women's" },
  { value: '7', inches: '29.5"', label: "Men's" },
]

const PRICE = 49.99
// Bundle: ball 1 full price + ball 2 at 50% off = $49.99 + $25.00 = $74.99
const BUNDLE_PRICE = PRICE + Math.round(PRICE * 50) / 100
// Free shot analyses granted per single training ball.
const FREE_ANALYSES_PER_BALL = 5

// The product description reformatted as feature tiles — same facts as the
// paragraph and the selectors in the buy box, no new claims.
const FEATURES = [
  { num: '01', title: 'Grip lines', desc: 'Mark exactly where your fingers belong on the ball.' },
  { num: '02', title: 'Groove your release', desc: 'Every rep grooves proper hand placement and release.' },
  { num: '03', title: 'Two editions', desc: 'Left and right-handed — pick the edition for your shooting hand.' },
  { num: '04', title: 'Three sizes', desc: `27.5" youth, 28.5" women's, 29.5" men's.` },
]

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function ShopProduct({ isInApp = false }: { isInApp?: boolean }) {
  const { addBall } = useCart()
  const [variant, setVariant] = useState<Variant>('right')
  const [size, setSize] = useState<Size>('7')
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const lineTotal = Math.round(PRICE * quantity * 100) / 100
  const displayUnit = formatPrice(PRICE)
  const displayLineTotal = formatPrice(lineTotal)

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
    <div className="flex-1">
      {/* Product hero: sticky gallery left, buy box card right */}
      <section className="hero-glow grain relative px-4 pt-10 pb-14 sm:pt-16 sm:pb-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Video gallery — the clips are portrait, so give them portrait
              frames; staggered on desktop and sticky so they stay in view
              while the buy box scrolls */}
          <div className="lg:col-span-7 lg:sticky lg:top-24 grid grid-cols-2 gap-4 items-start">
            <video
              className="w-full rounded-3xl border border-courtline bg-ink-900 aspect-[9/16] object-cover"
              controls
              preload="metadata"
              playsInline
            >
              <source src="/ball-video-1.mp4#t=0.001" type="video/mp4" />
            </video>
            <video
              className="w-full rounded-3xl border border-courtline bg-ink-900 aspect-[9/16] object-cover lg:mt-10"
              controls
              preload="metadata"
              playsInline
            >
              <source src="/ball-video-2.mp4#t=0.001" type="video/mp4" />
            </video>
          </div>

          {/* Buy box */}
          <div className="lg:col-span-5 flex flex-col gap-5 bg-ink-900/60 border border-courtline rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-1.5">
                <span className="text-green-500 text-xs font-semibold tracking-wider uppercase">In Stock</span>
              </div>
              {!isInApp && (
                <span className="inline-flex items-center bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold px-3 py-1.5 rounded-full">
                  {FREE_ANALYSES_PER_BALL * quantity} Shot Analyses Included Free
                  {quantity > 1 ? ` (${FREE_ANALYSES_PER_BALL} per ball)` : ''}
                </span>
              )}
            </div>

            <h1 className="font-display font-black uppercase text-[clamp(1.7rem,3vw,2.4rem)] text-chalk leading-[0.95] break-words">
              The LearnHoops <span className="text-gradient-ember">Training Ball</span>
            </h1>

            <p className="text-white text-base leading-relaxed">
              A training ball built to fix your shooting form. Pick the edition for your shooting hand —
              the grip lines mark exactly where your fingers belong, so every rep grooves proper hand
              placement and release.
            </p>

            <div className="font-numeric text-3xl font-medium text-chalk">
              {displayUnit}
            </div>

            {/* Variant selector */}
            <div className="space-y-2">
              <label className="block text-white text-xs font-semibold tracking-wider uppercase">Edition</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setVariant('right')}
                  className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                    variant === 'right'
                      ? 'border-ember-500 bg-ember-500/10'
                      : 'border-courtline hover:border-chalk-dim/60'
                  }`}
                >
                  <div className="text-white font-bold text-base">Right-handed</div>
                  <div className="text-white text-xs mt-1">For right-hand shooters</div>
                </button>
                <button
                  onClick={() => setVariant('left')}
                  className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                    variant === 'left'
                      ? 'border-ember-500 bg-ember-500/10'
                      : 'border-courtline hover:border-chalk-dim/60'
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
                        ? 'border-ember-500 bg-ember-500/10'
                        : 'border-courtline hover:border-chalk-dim/60'
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
              className="bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all w-full shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
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
                  className="text-ember-400 hover:text-ember-500 text-sm font-semibold underline"
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

      {/* Feature band */}
      <section className="border-y border-courtline bg-ink-900/50">
        <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.num}
              className="fade-up card-lift bg-ink-800/60 border border-courtline rounded-2xl p-6"
            >
              <div className="font-numeric text-ember-400 text-lg mb-5 select-none">{f.num}</div>
              <h3 className="font-display font-bold uppercase text-lg text-chalk mb-2 leading-tight">
                {f.title}
              </h3>
              <p className="text-chalk-dim text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2-Ball Bundle */}
      <BundleSection isInApp={isInApp} />

      {/* 1 Shot Analysis */}
      {!isInApp && (
        <section className="px-4 py-14 sm:py-16">
          <div className="max-w-xl mx-auto">
            <PremiumCTA dark />
          </div>
        </section>
      )}
    </div>
  )
}

function BundleSection({ isInApp = false }: { isInApp?: boolean }) {
  const { addBundle } = useCart()
  const [v1, setV1] = useState<Variant>('right')
  const [s1, setS1] = useState<Size>('7')
  const [v2, setV2] = useState<Variant>('right')
  const [s2, setS2] = useState<Size>('7')
  const [added, setAdded] = useState(false)

  const originalPrice = Math.round(PRICE * 2 * 100) / 100
  const savings = Math.round((originalPrice - BUNDLE_PRICE) * 100) / 100

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
    <section className="bg-ink-900 border-b border-courtline">
      <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20 space-y-8">
        <div className="flex flex-wrap items-end gap-6 justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center bg-ember-500 text-white text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full select-none">
                Best Value
              </span>
              {!isInApp && (
                <span className="inline-flex items-center bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold px-3 py-1 rounded-full">
                  10 Shot Analyses Included Free
                </span>
              )}
            </div>
            <h2 className="font-display font-black uppercase text-[clamp(1.9rem,4.5vw,3rem)] text-chalk leading-[0.95] mt-3">
              2-Ball Bundle
            </h2>
            <p className="text-chalk-dim text-sm max-w-md">
              {isInApp ? 'Get 2 training balls. Second ball 50% off.' : 'Get 2 training balls + 10 free AI shot analyses. Second ball 50% off.'}
            </p>
          </div>
          <div className="text-right">
            <div className="font-numeric text-4xl font-medium text-chalk">
              {formatPrice(BUNDLE_PRICE)}
            </div>
            <div className="text-sm text-zinc-500 line-through">
              {formatPrice(originalPrice)}
            </div>
            <div className="text-sm text-green-400 font-semibold">
              Save {formatPrice(savings)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            className="bg-ember-500 hover:bg-ember-400 active:scale-[0.98] text-ink-950 font-bold px-8 py-4 rounded-full text-base transition-all w-full sm:w-auto shadow-[0_0_40px_-8px_rgba(255,92,26,0.55)]"
          >
            Add Bundle to Cart — {formatPrice(BUNDLE_PRICE)}
          </button>

          {added && (
            <div
              role="status"
              className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3"
            >
              <span className="text-green-400 text-sm font-semibold">Added to cart</span>
              <Link
                href="/cart"
                className="text-ember-400 hover:text-ember-500 text-sm font-semibold underline"
              >
                View cart →
              </Link>
            </div>
          )}
        </div>

        {!isInApp && (
          <p className="text-zinc-500 text-xs">
            10 shot analysis credits will be added to your account automatically after purchase.
          </p>
        )}
      </div>
    </section>
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
    <div className="space-y-3 bg-ink-950 border border-courtline rounded-2xl p-5 sm:p-6">
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
                ? 'border-ember-500 bg-ember-500/10'
                : 'border-courtline hover:border-chalk-dim/60'
            }`}
          >
            <div className="text-white font-semibold text-sm">Right</div>
            <div className="text-zinc-400 text-xs">Right-hand</div>
          </button>
          <button
            onClick={() => onVariant('left')}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
              variant === 'left'
                ? 'border-ember-500 bg-ember-500/10'
                : 'border-courtline hover:border-chalk-dim/60'
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
                  ? 'border-ember-500 bg-ember-500/10'
                  : 'border-courtline hover:border-chalk-dim/60'
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
