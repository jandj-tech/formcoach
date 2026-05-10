'use client'

import { useState } from 'react'

type Variant = 'right' | 'left'

export default function ShopProduct() {
  const [variant, setVariant] = useState<Variant>('right')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleBuy() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant }),
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

          <div className="text-3xl font-black text-white">$49.99 <span className="text-white text-sm font-medium">USD</span></div>

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

          <button
            onClick={handleBuy}
            disabled={loading}
            className="bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-xl text-base transition-colors w-full sm:w-auto"
          >
            {loading ? 'Redirecting to checkout…' : `Buy Now — $49.99`}
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
