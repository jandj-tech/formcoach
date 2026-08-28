'use client'

import { useState } from 'react'
import {
  annualSavingsCents,
  ORG_ANNUAL_MONTHLY_CENTS,
  ORG_ANNUAL_TOTAL_CENTS,
  ORG_MONTHLY_CENTS,
  orgUsd,
  type OrgPlan,
} from '@/lib/org-subscription-pricing'

/**
 * Shown on the org dashboard when the plan has lapsed.
 *
 * Deliberately states what still works as well as what doesn't. A lapsed
 * organization keeps its teams, rosters, history and any tokens it already
 * bought — saying so plainly is both true and the thing most likely to bring
 * them back. No launch offer here: that is for new organizations.
 */
export default function ReactivatePanel() {
  const [loading, setLoading] = useState<OrgPlan | null>(null)
  const [error, setError] = useState('')

  async function reactivate(plan: OrgPlan) {
    setLoading(plan)
    setError('')
    try {
      const res = await fetch('/api/org/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
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
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 space-y-4">
      <div className="space-y-1">
        <p className="text-base font-black text-black">Your organization plan has ended</p>
        <p className="text-sm text-gray-600">
          Team chat, scheduling and leaderboards are switched off, and you can&rsquo;t add teams,
          coaches or players until the plan is back.
        </p>
      </div>

      <div className="bg-white border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
          What you keep
        </p>
        <p className="text-xs text-gray-600 leading-relaxed">
          Every team, roster and analysis stays exactly where it is, and any tokens you already
          bought are still yours to use or hand out. New tokens are charged at the regular{' '}
          <span className="font-semibold text-black">$3.49</span> rate instead of the organization
          rate.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => reactivate('monthly')}
          disabled={loading !== null}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-ink-950 font-black text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          {loading === 'monthly' ? 'Opening…' : `Reactivate — ${orgUsd(ORG_MONTHLY_CENTS)}/mo`}
        </button>
        <button
          type="button"
          onClick={() => reactivate('annual')}
          disabled={loading !== null}
          className="border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          {loading === 'annual'
            ? 'Opening…'
            : `Annual — ${orgUsd(ORG_ANNUAL_MONTHLY_CENTS)}/mo`}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Annual is billed once at {orgUsd(ORG_ANNUAL_TOTAL_CENTS)} and saves{' '}
        {orgUsd(annualSavingsCents())} a year.
      </p>
    </div>
  )
}
