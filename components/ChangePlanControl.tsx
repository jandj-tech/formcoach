'use client'

import { useCallback, useState } from 'react'
import {
  ORG_TIERS,
  orgUsd,
  planPerMonthCents,
  type BillingInterval,
  type PaidTier,
} from '@/lib/org-subscription-pricing'
import { discountedUnitCents, usd } from '@/lib/team-pricing'

/**
 * Switch between Basic and Plus, or monthly and annual, from the dashboard.
 *
 * Renders nothing for an organization with no paid subscription — grandfathered
 * and comped orgs already have everything and have nothing to change, so
 * offering them a plan switcher would be both useless and alarming.
 *
 * The change applies to the existing subscription with Stripe proration, so
 * there is no checkout redirect: on success the page simply reloads showing the
 * new plan.
 */
export default function ChangePlanControl({
  currentTier,
  currentInterval,
  hasBilling,
}: {
  currentTier: PaidTier | null
  currentInterval: BillingInterval | null
  hasBilling: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const change = useCallback(async (tier: PaidTier, interval: BillingInterval) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/org/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Could not change plan.')
        setBusy(false)
        return
      }
      window.location.reload()
    } catch {
      setError('Could not change plan.')
      setBusy(false)
    }
  }, [])

  // No paid subscription: nothing to switch.
  if (!hasBilling || !currentTier || !currentInterval) return null

  const other: PaidTier = currentTier === 'plus' ? 'basic' : 'plus'
  const otherInterval: BillingInterval = currentInterval === 'annual' ? 'monthly' : 'annual'
  const isUpgrade = other === 'plus'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <div>
        <p className="text-sm font-black text-black">
          You&rsquo;re on {ORG_TIERS[currentTier].name} —{' '}
          {orgUsd(planPerMonthCents(currentTier, currentInterval))}/mo
          {currentInterval === 'annual' ? ', billed annually' : ''}
        </p>
        {isUpgrade && (
          <p className="text-xs text-gray-500 mt-0.5">
            Plus adds team scheduling, unlimited teams, and the{' '}
            {usd(discountedUnitCents('plus', 10))} token rate at 10+.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => change(other, currentInterval)}
          disabled={busy}
          className={`text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${
            isUpgrade
              ? 'bg-orange-500 hover:bg-orange-400 text-ink-950'
              : 'border border-gray-300 text-gray-700 hover:border-gray-400'
          }`}
        >
          {busy ? 'Working…' : `${isUpgrade ? 'Upgrade to' : 'Switch to'} ${ORG_TIERS[other].name}`}
        </button>
        <button
          type="button"
          onClick={() => change(currentTier, otherInterval)}
          disabled={busy}
          className="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:border-gray-400 transition-colors disabled:opacity-50"
        >
          Switch to {otherInterval === 'annual' ? 'annual billing' : 'monthly billing'}
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Changes apply to your current subscription — Stripe prorates the difference.
      </p>
    </div>
  )
}
