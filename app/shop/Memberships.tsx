'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckIcon } from 'lucide-react'
import { trackInitiateCheckout } from '@/lib/meta-pixel'
import {
  PLAYER_PLANS,
  PLAYER_PLAN_ORDER,
  playerAnnualPerMonthCents,
  playerAnnualPercentOff,
  playerAnnualSavingsCents,
  type PlayerBillingInterval,
  type PlayerPlan,
} from '@/lib/player-plans'
import { usd } from '@/lib/team-pricing'
import { useRegionCurrency } from '@/lib/use-region-currency'

// Memberships at the top of the shop, in the store's ink theme. Prices and
// allowances read from lib/player-plans so this can never disagree with the
// pricing page or checkout. Pro is the highlighted "best value" pick.
//
// Never rendered inside the iOS app: memberships there are Apple-billed and a
// web subscribe button would be exactly what guideline 3.1.1 forbids.

const PERKS: Record<PlayerPlan, string[]> = {
  player: ['AI grade on every check', 'Written fixes for each one', 'Progress tracking week to week'],
  pro: ['Everything in Player', 'More than double the analyses', 'Made for players training every day'],
}

export default function Memberships({ isInApp = false }: { isInApp?: boolean }) {
  const router = useRouter()
  const [interval, setInterval] = useState<PlayerBillingInterval>('monthly')
  const [busy, setBusy] = useState<PlayerPlan | null>(null)
  const currency = useRegionCurrency()
  const [error, setError] = useState('')

  if (isInApp) return null

  async function subscribe(plan: PlayerPlan) {
    setBusy(plan)
    setError('')
    trackInitiateCheckout({
      value: PLAYER_PLANS[plan][interval === 'annual' ? 'annualTotalCents' : 'monthlyCents'] / 100,
      ...(currency ? { currency } : {}),
      content_name: `${plan}_${interval}`,
    })
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      })
      if (res.status === 401) {
        // A visitor who hit 401 here almost never has an account yet — /signup
        // honours `next` and offers login for the few who do.
        router.push(`/signup?next=${encodeURIComponent('/shop#memberships')}`)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; alreadySubscribed?: boolean }
      if (data.alreadySubscribed) {
        router.push('/dashboard')
        return
      }
      if (res.ok && data.url) {
        window.location.assign(data.url)
        return
      }
      setError(data.error || 'Could not start checkout.')
    } catch {
      setError('Could not start checkout.')
    }
    setBusy(null)
  }

  return (
    <section id="memberships" className="px-4 pt-6 pb-16 sm:pb-20 scroll-mt-20">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display font-black uppercase text-[clamp(1.6rem,3.5vw,2.4rem)] text-chalk leading-[0.95]">
              Get graded every week
            </h2>
            <p className="text-chalk-dim text-sm mt-2 max-w-xl">
              A membership includes shot analyses every week and month, so your form gets checked as often as you
              train. Cancel any time.
            </p>
          </div>
          <div role="tablist" aria-label="Billing period" className="inline-flex rounded-full border border-courtline bg-ink-900 p-1 text-xs font-bold">
            {(['monthly', 'annual'] as PlayerBillingInterval[]).map((i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={interval === i}
                onClick={() => setInterval(i)}
                className={`rounded-full px-4 py-1.5 transition-colors ${
                  interval === i ? 'bg-ember-500 text-ink-950' : 'text-chalk-dim hover:text-chalk'
                }`}
              >
                {i === 'monthly' ? 'Monthly' : 'Yearly'}
                {i === 'annual' && (
                  <span className={`ml-1.5 ${interval === i ? 'text-ink-950/70' : 'text-ember-400'}`}>
                    save {playerAnnualPercentOff('pro')}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLAYER_PLAN_ORDER.map((planId) => {
            const plan = PLAYER_PLANS[planId]
            const best = planId === 'pro'
            const price = interval === 'annual' ? plan.annualTotalCents : plan.monthlyCents
            return (
              <div
                key={planId}
                className={`relative rounded-2xl border p-5 sm:p-6 flex flex-col gap-4 ${
                  best
                    ? 'border-ember-500 bg-ember-500/10 shadow-[0_0_50px_-18px_rgba(255,92,26,0.5)]'
                    : 'border-courtline bg-ink-900'
                }`}
              >
                {best && (
                  <span className="absolute -top-2.5 left-5 text-[10px] font-black tracking-widest px-2.5 py-0.5 rounded-full bg-ember-500 text-ink-950">
                    BEST VALUE
                  </span>
                )}
                <div>
                  <h3 className="font-display font-black uppercase text-lg text-chalk">{plan.name}</h3>
                  <p className="text-chalk-dim text-xs mt-0.5">{plan.blurb}</p>
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-numeric text-4xl font-black text-chalk">{usd(price)}</span>
                    <span className="text-chalk-dim text-sm font-semibold">/{interval === 'annual' ? 'year' : 'month'}</span>
                  </div>
                  {interval === 'annual' && (
                    <p className="text-xs mt-1 text-chalk-dim">
                      about {usd(playerAnnualPerMonthCents(planId))}/month ·{' '}
                      <span className="font-bold text-ember-400">saves {usd(playerAnnualSavingsCents(planId))} a year</span>
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-ember-500/25 bg-ink-950/40 px-4 py-3">
                  <p className="text-sm font-black text-ember-400">{plan.weeklyLimit} analyses every week</p>
                  <p className="text-xs font-bold text-chalk">up to {plan.monthlyLimit} a month</p>
                </div>
                <ul className="space-y-1.5 text-sm text-chalk-dim flex-1">
                  {PERKS[planId].map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-ember-400 shrink-0 mt-0.5" aria-hidden />
                      {perk}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => subscribe(planId)}
                  disabled={busy !== null}
                  className={`w-full font-bold text-sm px-4 py-3 rounded-xl transition-colors disabled:opacity-60 ${
                    best
                      ? 'bg-ember-500 hover:bg-ember-400 text-ink-950'
                      : 'border-2 border-ember-500 text-ember-400 hover:bg-ember-500/10'
                  }`}
                >
                  {busy === planId ? 'Opening checkout…' : `Start ${plan.name.replace('LearnHoops ', '')}`}
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
          <p className="text-chalk-dim/80 text-xs">
            Billed by card through Stripe. Change or cancel from your dashboard any time.{' '}
            <Link href="/pricing" className="text-ember-400 font-semibold hover:underline">
              Compare plans in detail →
            </Link>
          </p>
          {error && <p className="text-xs font-bold text-red-400">{error}</p>}
        </div>
      </div>
    </section>
  )
}
