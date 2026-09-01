import Link from 'next/link'
import type { UsageSummary } from '@/lib/player-dashboard'
import { PLAYER_PLANS } from '@/lib/player-plans'

/**
 * The allowance banner above the analyze uploader, for Player/Pro subscribers.
 *
 * Three jobs, per the entitlement rules in /api/analyze:
 *   - plenty left      → quiet confirmation, no interruption
 *   - allowance spent,
 *     tokens on hand   → say CLEARLY that a purchased token is about to be
 *                        used, BEFORE it is — never silently
 *   - nothing left     → real reset dates plus the two useful actions,
 *                        so the page never feels broken
 *
 * Renders nothing for non-subscribers and grandfathered-unlimited accounts.
 * Dark-styled: it sits on the analyze page's ink background.
 */
export default function UsageNotice({ usage }: { usage: UsageSummary }) {
  if (!usage.entitled || usage.legacyUnlimited || !usage.plan) return null

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      : null

  // Which cap is binding right now (monthly wins — a weekly reset can't help).
  const monthlyBlocked = usage.monthlyRemaining === 0
  const weeklyBlocked = usage.weeklyRemaining === 0

  if (!monthlyBlocked && !weeklyBlocked) {
    const left = Math.min(usage.weeklyRemaining, usage.monthlyRemaining)
    return (
      <div className="w-full max-w-xl mb-3 flex items-center gap-2.5 rounded-xl border border-ember-500/25 bg-ember-500/10 px-4 py-2.5 text-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-ember-500 shrink-0" aria-hidden />
        <p className="text-chalk">
          <span className="font-bold text-ember-400">
            {left} included {left === 1 ? 'analysis' : 'analyses'}
          </span>{' '}
          available — {usage.weeklyRemaining} left this week, {usage.monthlyRemaining} this billing
          month.
        </p>
      </div>
    )
  }

  const blockedLabel = monthlyBlocked
    ? `You’ve used all ${usage.monthlyLimit} included analyses in your current billing period.`
    : `You’ve used your ${usage.weeklyLimit} included analyses this week.`
  const resetDays = monthlyBlocked ? usage.monthlyResetInDays : usage.weeklyResetInDays
  const resetText = monthlyBlocked
    ? `Your monthly allowance resets ${fmtDate(usage.monthlyResetAt) ?? 'at your next billing date'}.`
    : `Your weekly allowance resets in ${resetDays ?? 'a few'} day${resetDays === 1 ? '' : 's'}.`

  if (usage.purchasedTokens > 0) {
    return (
      <div className="w-full max-w-xl mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm space-y-1">
        <p className="font-bold text-amber-300">
          {monthlyBlocked ? 'Monthly analyses complete' : 'Weekly analyses complete'}
        </p>
        <p className="text-chalk">
          {blockedLabel} <span className="font-bold">This analysis will use 1 purchased analysis
          token</span>{' '}
          ({usage.purchasedTokens} available). {resetText}
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mb-3 rounded-xl border border-courtline bg-ink-900 px-4 py-3.5 text-sm space-y-2">
      <p className="font-bold text-chalk">
        {monthlyBlocked ? 'Monthly analyses complete' : 'Weekly analyses complete'}
      </p>
      <p className="text-chalk-dim">
        {blockedLabel} {resetText} Purchased analyses available: 0.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/shop#analysis-tokens"
          className="bg-ember-500 hover:bg-ember-400 text-ink-950 text-xs font-bold px-3.5 py-2 rounded-lg transition-colors"
        >
          Buy Extra Analysis
        </Link>
        {usage.plan === 'player' && (
          <Link
            href="/dashboard"
            className="border border-courtline hover:border-ember-500/60 text-chalk text-xs font-bold px-3.5 py-2 rounded-lg transition-colors"
          >
            Upgrade to Pro — up to {PLAYER_PLANS.pro.weeklyLimit}/week
          </Link>
        )}
      </div>
    </div>
  )
}
