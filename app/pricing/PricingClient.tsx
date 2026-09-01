'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import InfoTip from '@/components/InfoTip'
import { trackInitiateCheckout } from '@/lib/meta-pixel'
import { useIsInApp } from '@/lib/useIsInApp'
import {
  PLAYER_PLANS,
  PLAYER_PLAN_ORDER,
  playerAnnualPerMonthCents,
  playerAnnualPercentOff,
  playerAnnualSavingsCents,
  type PlayerBillingInterval,
  type PlayerPlan,
} from '@/lib/player-plans'
import {
  ORG_BULK_MIN_QTY,
  ORG_BULK_PRICE_CENTS,
  REGULAR_ANALYSIS_PRICE_CENTS,
  REGULAR_VOLUME_MIN_QTY,
  REGULAR_VOLUME_PRICE_CENTS,
  usd,
} from '@/lib/team-pricing'
import { ORG_TIERS, orgUsd } from '@/lib/org-subscription-pricing'

/**
 * The public pricing page. Every figure is DERIVED from the pricing libs —
 * nothing here is typed out — so this page can never disagree with what
 * checkout charges. Subscriptions are the primary option; one-off analyses
 * are deliberately secondary; organizations get a pointer, not a third card,
 * so the two player plans stay easy to compare.
 */

const PLAN_FEATURES: Record<PlayerPlan, string[]> = {
  player: [
    'Full 18-criteria AI shot breakdown',
    'Shot history and score tracking',
    'Training log and consistency tracking in the iOS app',
  ],
  pro: [
    'Full 18-criteria AI shot breakdown',
    'Shot history and score tracking',
    'Training log and consistency tracking in the iOS app',
    'Enough analyses to grade every serious session',
  ],
}

export default function PricingClient({
  signedIn,
  currentPlan,
}: {
  signedIn: boolean
  currentPlan: PlayerPlan | null
}) {
  const inApp = useIsInApp()
  const router = useRouter()
  const [interval, setInterval] = useState<PlayerBillingInterval>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<PlayerPlan | null>(null)
  const [error, setError] = useState('')

  async function choosePlan(plan: PlayerPlan) {
    if (!signedIn) {
      router.push(`/signup?next=${encodeURIComponent('/pricing')}`)
      return
    }
    if (currentPlan) {
      router.push('/dashboard')
      return
    }
    trackInitiateCheckout(PLAYER_PLANS[plan][interval === 'annual' ? 'annualTotalCents' : 'monthlyCents'] / 100)
    setLoadingPlan(plan)
    setError('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      })
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent('/pricing')}`)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      setLoadingPlan(null)
      setError(data.error || 'Could not start checkout. Please try again.')
    } catch {
      setLoadingPlan(null)
      setError('Could not start checkout. Please try again.')
    }
  }

  return (
    <div className="flex-1">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hero-glow grain relative flex flex-col items-center text-center px-4 pt-14 pb-10 sm:pt-20">
        <p className="eyebrow text-ember-400 mb-3 select-none">Pricing</p>
        <h1 className="font-display font-black uppercase text-[clamp(2.2rem,6vw,4.5rem)] leading-[0.95] max-w-2xl">
          Choose <span className="text-gradient-ember">your plan</span>
        </h1>
        <p className="text-chalk-dim text-sm sm:text-base mt-4 max-w-md">
          Improve your shot with consistent AI feedback — analyzed against 18 coaching criteria,
          every week.
        </p>

        {/* Billing toggle */}
        <div
          className="mt-8 inline-flex rounded-full border border-courtline bg-ink-900 p-1"
          role="tablist"
          aria-label="Billing frequency"
        >
          {(['monthly', 'annual'] as const).map((i) => (
            <button
              key={i}
              role="tab"
              aria-selected={interval === i}
              onClick={() => setInterval(i)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                interval === i ? 'bg-ember-500 text-ink-950' : 'text-chalk-dim hover:text-chalk'
              }`}
            >
              {i === 'monthly' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
        {interval === 'annual' && (
          <p className="text-ember-400 text-xs font-bold mt-3">
            Save up to {Math.max(...PLAYER_PLAN_ORDER.map(playerAnnualPercentOff))}% with yearly billing
          </p>
        )}
      </section>

      {/* ── Plan cards ───────────────────────────────────────────────── */}
      <section className="px-4 pb-14">
        <div className="max-w-3xl mx-auto grid sm:grid-cols-2 gap-5">
          {PLAYER_PLAN_ORDER.map((planId) => {
            const plan = PLAYER_PLANS[planId]
            const highlighted = planId === 'pro'
            const perMonth =
              interval === 'annual' ? playerAnnualPerMonthCents(planId) : plan.monthlyCents
            const isCurrent = currentPlan === planId
            return (
              <div
                key={planId}
                className={`relative rounded-2xl border p-6 flex flex-col gap-4 bg-ink-900 ${
                  highlighted ? 'border-ember-500/60 shadow-[0_0_50px_-18px_rgba(255,92,26,0.5)]' : 'border-courtline'
                }`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-ember-500 text-ink-950 text-[11px] font-black uppercase tracking-wide rounded-full px-3 py-1">
                    Most popular
                  </span>
                )}

                <div>
                  <h2 className="font-display font-black uppercase text-xl">{plan.name}</h2>
                  <p className="text-chalk-dim text-xs mt-1">{plan.blurb}</p>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-numeric text-4xl font-black">
                      {interval === 'annual' ? usd(plan.annualTotalCents) : usd(plan.monthlyCents)}
                    </span>
                    <span className="text-chalk-dim text-sm font-semibold">
                      /{interval === 'annual' ? 'year' : 'month'}
                    </span>
                  </div>
                  {interval === 'annual' && (
                    <p className="text-chalk-dim text-xs mt-1">
                      about {usd(perMonth)}/month — saves {usd(playerAnnualSavingsCents(planId))} (
                      {playerAnnualPercentOff(planId)}%) vs monthly
                    </p>
                  )}
                </div>

                {/* The caps, phrased the one way that cannot be misread. */}
                <div className="rounded-xl border border-ember-500/25 bg-ember-500/10 px-4 py-3">
                  <p className="text-sm font-black text-ember-400">
                    {plan.weeklyLimit} analyses per week
                  </p>
                  <p className="text-sm font-bold text-chalk flex items-center gap-1.5">
                    up to {plan.monthlyLimit} per month
                    <InfoTip label="How do the weekly and monthly limits work?" align="left">
                      Both limits apply: you can run {plan.weeklyLimit} analyses in any week of
                      your billing cycle, up to {plan.monthlyLimit} in the billing month in total.
                      Weekly and monthly allowances reset on your own billing schedule — yearly
                      subscribers get the same weekly and monthly allowances, not an upfront bank.
                      Unused analyses don&apos;t roll over.
                    </InfoTip>
                  </p>
                </div>

                <ul className="space-y-2 text-sm text-chalk-dim flex-1">
                  {PLAN_FEATURES[planId].map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-ember-400 font-black select-none" aria-hidden>
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* In the iOS app digital purchases must go through the App
                    Store, so the web checkout button is not rendered there. */}
                {!inApp && (
                  <button
                    onClick={() => choosePlan(planId)}
                    disabled={loadingPlan !== null || isCurrent}
                    className={`w-full rounded-xl px-4 py-3 text-sm font-black transition-colors ${
                      highlighted
                        ? 'bg-ember-500 hover:bg-ember-400 text-ink-950 disabled:bg-ember-500/40'
                        : 'border border-courtline text-chalk hover:border-ember-500/60 disabled:opacity-50'
                    }`}
                  >
                    {isCurrent
                      ? 'Your current plan'
                      : currentPlan
                        ? 'Change plan in dashboard'
                        : loadingPlan === planId
                          ? 'Opening checkout…'
                          : planId === 'pro'
                            ? 'Go Pro'
                            : 'Choose Player'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}
        <p className="text-chalk-dim text-xs text-center mt-5 max-w-md mx-auto">
          Cancel anytime — your plan runs to the end of the period you&apos;ve paid for. Purchased
          analysis tokens are separate and never expire with a plan.
        </p>
      </section>

      {/* ── One-time analyses (secondary on purpose) ─────────────────── */}
      {!inApp && (
        <section className="px-4 pb-14">
          <div className="max-w-3xl mx-auto rounded-2xl border border-courtline bg-ink-900 p-6 sm:flex items-center justify-between gap-6">
            <div>
              <h2 className="font-display font-black uppercase text-lg">Need an extra analysis?</h2>
              <p className="text-chalk-dim text-sm mt-1">
                Purchase individual analyses anytime — no subscription needed.
              </p>
              <p className="text-sm mt-3">
                <span className="font-bold text-chalk">
                  1–{REGULAR_VOLUME_MIN_QTY - 1} analyses · {usd(REGULAR_ANALYSIS_PRICE_CENTS)} each
                </span>
                <span className="text-chalk-dim"> — </span>
                <span className="font-bold text-ember-400">
                  {REGULAR_VOLUME_MIN_QTY}+ analyses · {usd(REGULAR_VOLUME_PRICE_CENTS)} each
                </span>
              </p>
              <p className="text-chalk-dim text-xs mt-1">
                Buy {REGULAR_VOLUME_MIN_QTY} or more and every analysis in the order is{' '}
                {usd(REGULAR_VOLUME_PRICE_CENTS)}.
              </p>
            </div>
            <Link
              href="/shop#analysis-tokens"
              className="inline-block shrink-0 mt-4 sm:mt-0 border border-courtline hover:border-ember-500/60 text-chalk font-bold text-sm px-5 py-3 rounded-xl transition-colors"
            >
              Buy Analyses →
            </Link>
          </div>
        </section>
      )}

      {/* ── Organizations ────────────────────────────────────────────── */}
      <section className="px-4 pb-20">
        <div className="max-w-3xl mx-auto rounded-2xl border border-courtline bg-ink-900 p-6">
          <p className="eyebrow text-ember-400 mb-2 select-none">Clubs &amp; Organizations</p>
          <h2 className="font-display font-black uppercase text-lg">Running a team or club?</h2>
          <p className="text-chalk-dim text-sm mt-2 max-w-xl">
            Organization plans start at {orgUsd(ORG_TIERS.basic.monthlyCents)}/month and include
            bulk analysis tokens at{' '}
            <span className="text-chalk font-bold">{usd(ORG_BULK_PRICE_CENTS)} each</span> when
            purchasing {ORG_BULK_MIN_QTY} or more on the LearnHoops website — plus team rosters,
            leaderboards, and coach uploads.
          </p>
          <Link
            href="/team"
            className="inline-block mt-4 border border-courtline hover:border-ember-500/60 text-chalk font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
          >
            Learn about Organizations →
          </Link>
        </div>
      </section>
    </div>
  )
}
