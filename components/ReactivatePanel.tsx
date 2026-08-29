'use client'

import { useCallback, useState } from 'react'
import {
  annualSavingsCents,
  ORG_TIER_ORDER,
  ORG_TIERS,
  orgUsd,
  planPerMonthCents,
  planTotalCents,
  type BillingInterval,
  type PaidTier,
} from '@/lib/org-subscription-pricing'
import { discountedUnitCents, usd } from '@/lib/team-pricing'

/**
 * Shown on the org dashboard when the plan has lapsed.
 *
 * Deliberately states what still works as well as what doesn't. A lapsed
 * organization keeps its teams, rosters, history and any tokens it already
 * bought — saying so plainly is both true and the thing most likely to bring
 * them back. No launch offer here: that is for new organizations.
 */
export default function ReactivatePanel() {
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [loading, setLoading] = useState<PaidTier | null>(null)
  const [error, setError] = useState('')

  const reactivate = useCallback(async (tier: PaidTier) => {
    setLoading(tier)
    setError('')
    try {
      const res = await fetch('/api/org/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 409 && data?.alreadyActive) {
        window.location.reload()
        return
      }
      if (!res.ok || !data?.url) {
        setError(data?.error || 'Could not start checkout. Please try again.')
        setLoading(null)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Could not start checkout. Please try again.')
      setLoading(null)
    }
  }, [interval])

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="text-base font-black text-black">Your organization plan has ended</p>
          <p className="text-sm text-gray-600">
            Team chat, scheduling and leaderboards are switched off, and you can&rsquo;t add teams,
            coaches or players until the plan is back.
          </p>
        </div>
        <div
          className="inline-flex rounded-full border border-amber-300 bg-white p-1 shrink-0"
          role="group"
          aria-label="Billing interval"
        >
          {(['monthly', 'annual'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBillingInterval(option)}
              aria-pressed={interval === option}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                interval === option ? 'bg-orange-500 text-ink-950' : 'text-gray-500 hover:text-black'
              }`}
            >
              {option === 'monthly' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
          What you keep
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Every team, roster and analysis stays exactly where it is, and any tokens you already
          bought are still yours to use or hand out. New tokens are charged at the regular{' '}
          <span className="font-semibold text-black">{usd(discountedUnitCents('none', 1))}</span>{' '}
          rate instead of the organization rate.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {ORG_TIER_ORDER.map((tierId) => {
          const plan = ORG_TIERS[tierId]
          const isPlus = tierId === 'plus'
          return (
            <button
              key={tierId}
              type="button"
              onClick={() => reactivate(tierId)}
              disabled={loading !== null}
              className={`rounded-xl px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                isPlus
                  ? 'bg-orange-500 hover:bg-orange-400 text-ink-950'
                  : 'border border-orange-300 text-orange-800 hover:bg-orange-50'
              }`}
            >
              <span className="block text-sm font-black">
                {loading === tierId ? 'Opening…' : `Reactivate ${plan.name}`}
              </span>
              <span className={`block text-xs mt-0.5 ${isPlus ? 'text-ink-950/80' : 'text-orange-700'}`}>
                {orgUsd(planPerMonthCents(tierId, interval))}/mo
                {interval === 'annual'
                  ? ` — billed ${orgUsd(planTotalCents(tierId, 'annual'))}, saves ${orgUsd(annualSavingsCents(tierId))}/yr`
                  : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
