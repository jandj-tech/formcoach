'use client'

import { useState } from 'react'

const PRICES = {
  monthly: { US: '$2.49/mo', CA: '$3.49/mo CAD' },
  annual:  { US: '$11.99/yr', CA: '$16.99/yr CAD' },
}

export default function PremiumCTA({ dark = false }: { dark?: boolean }) {
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly')
  const [country, setCountry] = useState<'US' | 'CA'>('US')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const priceLabel = PRICES[plan][country]

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, country }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setLoading(false)
    }
  }

  const labelColor = dark ? 'text-white' : 'text-black'
  const subColor = dark ? 'text-zinc-400' : 'text-gray-500'
  const borderColor = dark ? 'border-zinc-700' : 'border-orange-200'
  const bgColor = dark ? 'bg-zinc-900' : 'bg-orange-50'
  const toggleBg = dark ? 'bg-zinc-800' : 'bg-white'
  const toggleActiveBg = 'bg-orange-500'

  if (!open) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${bgColor} border ${borderColor}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">🔓</span>
          <span className={`text-sm font-medium truncate ${labelColor}`}>
            Unlimited analyses from <span className="font-bold text-orange-500">$2.49/mo</span>
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
        >
          Upgrade →
        </button>
      </div>
    )
  }

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 space-y-4`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${labelColor}`}>🔓 Get Unlimited Analyses</span>
        <button onClick={() => setOpen(false)} className={`text-xs ${subColor} hover:opacity-70`}>✕</button>
      </div>

      {/* Plan toggle */}
      <div>
        <p className={`text-xs font-semibold mb-1.5 ${subColor}`}>PLAN</p>
        <div className={`inline-flex rounded-lg p-1 gap-1 border ${borderColor} ${toggleBg}`}>
          <button
            onClick={() => setPlan('monthly')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              plan === 'monthly' ? `${toggleActiveBg} text-white` : `${labelColor} hover:opacity-70`
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPlan('annual')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors relative ${
              plan === 'annual' ? `${toggleActiveBg} text-white` : `${labelColor} hover:opacity-70`
            }`}
          >
            Yearly
            {plan !== 'annual' && (
              <span className="absolute -top-2 -right-1 bg-green-500 text-white text-[9px] font-bold px-1 rounded-full leading-tight">SAVE</span>
            )}
          </button>
        </div>
      </div>

      {/* Country toggle */}
      <div>
        <p className={`text-xs font-semibold mb-1.5 ${subColor}`}>LOCATION</p>
        <div className={`inline-flex rounded-lg p-1 gap-1 border ${borderColor} ${toggleBg}`}>
          <button
            onClick={() => setCountry('US')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              country === 'US' ? `${toggleActiveBg} text-white` : `${labelColor} hover:opacity-70`
            }`}
          >
            🇺🇸 USA
          </button>
          <button
            onClick={() => setCountry('CA')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
              country === 'CA' ? `${toggleActiveBg} text-white` : `${labelColor} hover:opacity-70`
            }`}
          >
            🇨🇦 Canada
          </button>
        </div>
      </div>

      {/* Price + CTA */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-orange-500 font-black text-lg">{priceLabel}</span>
          {plan === 'annual' && (
            <p className={`text-xs ${subColor} mt-0.5`}>Billed once a year · Cancel anytime</p>
          )}
          {plan === 'monthly' && (
            <p className={`text-xs ${subColor} mt-0.5`}>Billed monthly · Cancel anytime</p>
          )}
        </div>
        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          {loading ? '...' : 'Subscribe →'}
        </button>
      </div>
    </div>
  )
}
