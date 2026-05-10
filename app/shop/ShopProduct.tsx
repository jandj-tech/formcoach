'use client'

import { useState } from 'react'

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
  const [region, setRegion] = useState<Region>('US')
  const [variant, setVariant] = useState<Variant>('right')
  const [size, setSize] = useState<Size>('7')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const priceCad = Math.round(PRICE_USD * usdToCad * 100) / 100
  const displayPrice =
    region === 'CA' ? formatCurrency(priceCad, 'CAD') : formatCurrency(PRICE_USD, 'USD')
  const currencyLabel = region === 'CA' ? 'CAD' : 'USD'

  async function handleBuy() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant, size, region }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed')
      }
      window.location.href = data.url
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
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
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 self-start">
            <span className="text-orange-500 text-xs font-semibold tracking-wider uppercase">In Stock</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight">
            The LearnHoops.com <span className="text-orange-500">Training Ball</span>
          </h1>

          <p className="text-white text-base leading-relaxed">
            Built with Maple Basketball for serious shooters. Choose the edition that matches your shooting hand
            so the grip lines guide your form.
          </p>

          {/* Region / currency selector */}
          <div className="space-y-2">
            <label className="block text-white text-xs font-semibold tracking-wider uppercase">Where are you shopping from?</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRegion('US')}
                className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                  region === 'US'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="text-white font-bold text-base flex items-center gap-2">
                  <span aria-hidden className="text-xl leading-none">🇺🇸</span>
                  United States
                </div>
                <div className="text-white text-xs mt-1">Prices in USD</div>
              </button>
              <button
                onClick={() => setRegion('CA')}
                className={`rounded-xl border-2 px-4 py-4 text-left transition-colors ${
                  region === 'CA'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="text-white font-bold text-base flex items-center gap-2">
                  <span aria-hidden className="text-xl leading-none">🇨🇦</span>
                  Canada
                </div>
                <div className="text-white text-xs mt-1">Prices in CAD</div>
              </button>
            </div>
          </div>

          <div className="text-3xl font-black text-white">
            {displayPrice} <span className="text-white text-sm font-medium">{currencyLabel}</span>
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

          <button
            onClick={handleBuy}
            disabled={loading}
            className="bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors w-full sm:w-auto"
          >
            {loading ? 'Redirecting to checkout…' : `Buy Now — ${displayPrice}`}
          </button>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <p className="text-white text-xs">
            Secure checkout powered by Stripe. Shipping address collected at checkout.
          </p>
        </div>
      </div>
    </section>
  )
}
