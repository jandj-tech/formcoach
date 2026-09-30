'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PLAYER_PLANS,
  playerAnnualPerMonthCents,
  playerPlanTotalCents,
  type PlayerBillingInterval,
  type PlayerPlan,
} from '@/lib/player-plans'
import { usd } from '@/lib/team-pricing'

/**
 * Manage / change-plan buttons on the player dashboard.
 *
 * Cancellation, card updates and invoices live in the Stripe Customer Portal
 * (the org dashboard precedent); plan and interval switches go through
 * /api/player/change-plan, which updates the subscription in place with
 * proration. Every price shown is derived — the server recomputes it anyway.
 */
export default function PlanControls({
  plan,
  interval,
  clubSeat,
  coveringClub,
}: {
  plan: PlayerPlan
  interval: PlayerBillingInterval
  /**
   * Set while a club PLAYER seat covers this player. Only the upgrade to Pro
   * is offered: the player pays for Pro themselves and the club's seat stays.
   * `ownPlan` = their own Stripe Player plan sits paused under the seat (it
   * changes in place and the pause lifts); otherwise it's a new Pro checkout
   * through /api/subscribe, which allows a plan above the seat.
   */
  clubSeat?: { orgName: string; lastDay: string; ownPlan: boolean }
  /**
   * Set while a club seat covers this player but their OWN higher plan is the
   * one in use (club Player seat + personal Pro). Switching the personal plan
   * to the seat's plan or lower is never offered — /api/player/change-plan
   * refuses it (personalPlanVsClub) because the club already pays for it.
   * `planName` is the seat's plan; `blocksOtherPlan` is computed server-side
   * with the same rank rule. Interval switches and the portal stay.
   */
  coveringClub?: { planName: string; lastDay: string; blocksOtherPlan: boolean }
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function openPortal() {
    setBusy('portal')
    setError('')
    try {
      const res = await fetch('/api/player/billing-portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError(data.error || 'Could not open billing.')
    } catch {
      setError('Could not open billing.')
    }
    setBusy(null)
  }

  async function changePlan(nextPlan: PlayerPlan, nextInterval: PlayerBillingInterval, label: string) {
    const price = playerPlanTotalCents(nextPlan, nextInterval)
    const per = nextInterval === 'annual' ? `${usd(price)}/year` : `${usd(price)}/month`
    const ok = window.confirm(
      clubSeat
        ? `Upgrade to ${PLAYER_PLANS[nextPlan].name}: you'd pay for it yourself, ${per}, and your own plan starts billing again now. ` +
          `${clubSeat.orgName}'s Player membership stays on your account until ${clubSeat.lastDay}. Continue?`
        : `${label}: ${PLAYER_PLANS[nextPlan].name}, billed ${per}. Stripe prorates the difference on your current billing cycle. Continue?`,
    )
    if (!ok) return
    setBusy(`${nextPlan}-${nextInterval}`)
    setError('')
    try {
      const res = await fetch('/api/player/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: nextPlan, interval: nextInterval }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        // Upgrading above a club membership: say the club's seat stays.
        if (!clubSeat && typeof data.note === 'string' && data.note) window.alert(data.note)
        router.refresh()
      } else {
        setError(data.error || 'Could not change plan.')
      }
    } catch {
      setError('Could not change plan.')
    }
    setBusy(null)
  }

  async function startProCheckout() {
    setBusy('pro-checkout')
    setError('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setError(data.error || 'Could not start checkout.')
    } catch {
      setError('Could not start checkout.')
    }
    setBusy(null)
  }

  if (clubSeat) {
    const price = playerPlanTotalCents('pro', interval)
    return (
      <div className="space-y-1.5">
        <button
          onClick={() => (clubSeat.ownPlan ? changePlan('pro', interval, 'Upgrade') : startProCheckout())}
          disabled={busy !== null}
          className="text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 border border-gray-300 dark:border-courtline text-gray-800 dark:text-chalk hover:border-orange-400"
        >
          {busy ? 'Upgrading…' : `Upgrade to Pro — ${PLAYER_PLANS.pro.weeklyLimit}/week, up to ${PLAYER_PLANS.pro.monthlyLimit}/month`}
        </button>
        <p className="text-xs text-gray-500 dark:text-chalk-dim">
          You&apos;d pay for Pro yourself ({usd(price)}/{interval === 'annual' ? 'year' : 'month'}). Your club&apos;s Player
          membership stays until {clubSeat.lastDay}.
        </p>
        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
    )
  }

  const otherPlan: PlayerPlan = plan === 'player' ? 'pro' : 'player'
  const otherInterval: PlayerBillingInterval = interval === 'monthly' ? 'annual' : 'monthly'
  const upgrade = otherPlan === 'pro'
  const offerOtherPlan = !coveringClub?.blocksOtherPlan

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {offerOtherPlan && (
        <button
          onClick={() => changePlan(otherPlan, interval, upgrade ? 'Upgrade' : 'Switch plan')}
          disabled={busy !== null}
          className={`text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 ${
            upgrade
              ? 'bg-orange-500 hover:bg-orange-400 text-ink-950'
              : 'border border-gray-300 dark:border-courtline text-gray-700 dark:text-chalk hover:border-orange-400'
          }`}
        >
          {upgrade
            ? `Upgrade to Pro — ${PLAYER_PLANS.pro.weeklyLimit}/week, up to ${PLAYER_PLANS.pro.monthlyLimit}/month`
            : 'Switch to Player'}
        </button>
        )}
        <button
          onClick={() =>
            changePlan(plan, otherInterval, otherInterval === 'annual' ? 'Switch to yearly billing' : 'Switch to monthly billing')
          }
          disabled={busy !== null}
          className="text-sm font-bold px-4 py-2 rounded-xl border border-gray-300 dark:border-courtline text-gray-700 dark:text-chalk hover:border-orange-400 transition-colors disabled:opacity-50"
        >
          {otherInterval === 'annual'
            ? `Switch to yearly — about ${usd(playerAnnualPerMonthCents(plan))}/mo`
            : 'Switch to monthly billing'}
        </button>
        <button
          onClick={openPortal}
          disabled={busy !== null}
          className="text-sm font-semibold px-4 py-2 rounded-xl text-gray-500 dark:text-chalk-dim hover:text-black dark:hover:text-chalk transition-colors disabled:opacity-50"
        >
          {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
        </button>
      </div>
      {coveringClub && (
        <p className="text-xs text-gray-500 dark:text-chalk-dim">
          Your club&apos;s {coveringClub.planName} membership stays until {coveringClub.lastDay}. If you cancel{' '}
          {plan === 'pro' ? 'Pro' : 'Player'}, you&apos;ll keep the club&apos;s {coveringClub.planName} membership.
        </p>
      )}
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  )
}
