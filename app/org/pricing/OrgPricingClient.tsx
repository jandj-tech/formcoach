'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, XIcon } from 'lucide-react'
import {
  annualSavingsCents,
  launchOfferMonthlyCents,
  LAUNCH_OFFER_MONTHS,
  LAUNCH_OFFER_PERCENT_OFF,
  ORG_PLAN_FEATURES,
  ORG_TIER_ORDER,
  ORG_TIERS,
  orgUsd,
  planPerMonthCents,
  planTotalCents,
  type BillingInterval,
  type PaidTier,
} from '@/lib/org-subscription-pricing'

interface Props {
  orgName: string
  /** ISO timestamp issued by the server. The client never invents a deadline. */
  offerExpiresAt: string | null
  inApp: boolean
}

/** mm:ss, floored at zero. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function OrgPricingClient({ orgName, offerExpiresAt, inApp }: Props) {
  const router = useRouter()

  // Monthly is the default on purpose: it is the higher price, and the annual
  // saving then reads as a discount someone chooses rather than a default they
  // never notice they left.
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [loading, setLoading] = useState<PaidTier | null>(null)
  const [error, setError] = useState('')

  // Recomputed from Date.now() on every tick rather than decremented, so a
  // backgrounded tab that stops firing timers doesn't drift out of step with
  // the server's deadline.
  //
  // Starts null rather than reading the clock during render: Date.now() is
  // impure, and on the server it would produce a different number than the
  // client, i.e. a hydration mismatch on the one number people are watching.
  const deadline = offerExpiresAt ? new Date(offerExpiresAt).getTime() : null
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!deadline) return
    const tick = () => setRemaining(deadline - Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  // Before the first tick, a deadline existing IS the offer being live — the
  // server only issues one when it just armed the window. That keeps the
  // discounted price on screen at first paint instead of flashing full price.
  const offerLive = deadline !== null && (remaining === null || remaining > 0)
  // The launch offer is monthly-only: on a yearly interval a 3-month repeating
  // coupon would cover the whole first invoice.
  const offerApplies = offerLive && interval === 'monthly'

  const buy = useCallback(
    async (tier: PaidTier) => {
      setLoading(tier)
      setError('')
      try {
        const res = await fetch('/api/org/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Tell the server what we showed. It re-checks and refuses rather
          // than quietly charging full price for a button that said less.
          body: JSON.stringify({ tier, interval, offer: offerApplies }),
        })
        const data = await res.json()

        if (res.status === 409 && data?.expired) {
          setError('That offer just expired — the price below is up to date.')
          setRemaining(0)
          setLoading(null)
          return
        }
        if (res.status === 401 && data?.restart) {
          router.push('/org/signup')
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
    },
    [interval, offerApplies, router],
  )

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-20">
      <div className="text-center space-y-3 pt-10 pb-6">
        <p className="eyebrow text-ember-400 select-none">Organization plans</p>
        <h1 className="font-display font-black uppercase text-3xl sm:text-4xl text-chalk">
          Get {orgName ? orgName : 'your club'} <span className="text-gradient-ember">on LearnHoops</span>
        </h1>
        <p className="text-chalk-dim text-sm max-w-lg mx-auto">
          One subscription covers your whole organization — every coach, every player. No
          per-seat pricing.
        </p>
      </div>

      {/* ── The countdown. Deliberately the loudest thing on the page. ─────── */}
      {offerLive && !inApp && (
        <div
          className="mb-6 rounded-2xl border-2 border-ember-500 bg-ember-500/10 px-5 py-5 text-center"
          role="status"
        >
          <p className="eyebrow text-ember-400 mb-2 flex items-center justify-center gap-2 select-none">
            <span className="w-2 h-2 rounded-full bg-ember-500 animate-pulse" aria-hidden />
            Launch offer ends in
          </p>
          <p className="font-numeric font-black text-5xl sm:text-6xl text-chalk leading-none tabular-nums">
            {remaining === null ? '5:00' : formatRemaining(remaining)}
          </p>
          <p className="text-sm text-chalk mt-3">
            <span className="font-bold text-ember-400">{LAUNCH_OFFER_PERCENT_OFF}% off</span> your
            first {LAUNCH_OFFER_MONTHS} months on any monthly plan
          </p>
        </div>
      )}

      {/* ── Billing interval switch, top-right of the cards ────────────────── */}
      <div className="flex justify-end mb-4">
        <div
          className="inline-flex rounded-full border border-courtline bg-ink-900 p-1"
          role="group"
          aria-label="Billing interval"
        >
          {(['monthly', 'annual'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBillingInterval(option)}
              aria-pressed={interval === option}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                interval === option
                  ? 'bg-ember-500 text-ink-950'
                  : 'text-chalk-dim hover:text-chalk'
              }`}
            >
              {option === 'monthly' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-4 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {ORG_TIER_ORDER.map((tierId) => {
          const plan = ORG_TIERS[tierId]
          const isPlus = tierId === 'plus'
          const perMonth = planPerMonthCents(tierId, interval)
          const discounted = offerApplies ? launchOfferMonthlyCents(tierId) : null

          return (
            <div
              key={tierId}
              className={`rounded-2xl border p-5 sm:p-6 flex flex-col ${
                isPlus ? 'border-ember-500 bg-ember-500/[0.07]' : 'border-courtline bg-ink-900'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                <h2 className="font-display font-black uppercase text-xl text-chalk">{plan.name}</h2>
                {discounted && (
                  <span className="rounded-full bg-ember-500 px-2 py-0.5 text-[11px] font-black text-ink-950">
                    {LAUNCH_OFFER_PERCENT_OFF}% OFF
                  </span>
                )}
                {isPlus && !discounted && (
                  <span className="rounded-full bg-ember-500 px-2 py-0.5 text-[11px] font-black text-ink-950">
                    BEST VALUE
                  </span>
                )}
              </div>
              <p className="text-xs text-chalk-dim mb-4">{plan.blurb}</p>

              <div className="flex items-end gap-2 flex-wrap">
                {discounted && (
                  <span className="font-numeric text-xl text-chalk-dim line-through">
                    {orgUsd(perMonth)}
                  </span>
                )}
                <span className="font-numeric text-4xl font-black text-chalk">
                  {orgUsd(discounted ?? perMonth)}
                </span>
                <span className="text-chalk-dim text-sm pb-1">per month</span>
              </div>

              <p className="text-xs text-chalk-dim mt-1 min-h-[2.5rem]">
                {discounted
                  ? `for your first ${LAUNCH_OFFER_MONTHS} months, then ${orgUsd(perMonth)}/month`
                  : interval === 'annual'
                    ? `billed annually at ${orgUsd(planTotalCents(tierId, 'annual'))} — saves ${orgUsd(annualSavingsCents(tierId))} a year`
                    : 'billed monthly, cancel any time'}
              </p>

              <BuyButton
                label={`Get ${plan.name}`}
                loading={loading === tierId}
                disabled={loading !== null}
                onClick={() => buy(tierId)}
                inApp={inApp}
                variant={isPlus ? 'primary' : 'ghost'}
              />

              {/* Both cards render every row, so what Basic lacks is visible
                  rather than merely absent. */}
              <ul className="mt-5 space-y-2.5 border-t border-courtline pt-4">
                {ORG_PLAN_FEATURES.map((f) => {
                  const included = tierId === 'plus' ? f.plus : f.basic
                  return (
                    <li key={f.label} className="flex gap-2.5">
                      {included ? (
                        <CheckIcon className="w-4 h-4 text-ember-400 shrink-0 mt-0.5" aria-hidden />
                      ) : (
                        <XIcon className="w-4 h-4 text-chalk-dim/50 shrink-0 mt-0.5" aria-hidden />
                      )}
                      <span className={`text-sm ${included ? 'text-chalk' : 'text-chalk-dim/60'}`}>
                        {f.label}
                        {included && f.note && (
                          <span className="block text-xs text-chalk-dim mt-0.5">{f.note}</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-center text-xs text-chalk-dim">
        Your organization account is created as soon as your payment goes through. Change plan or
        cancel any time from your dashboard.
      </p>
    </div>
  )
}

function BuyButton({
  label,
  loading,
  disabled,
  onClick,
  inApp,
  variant,
}: {
  label: string
  loading: boolean
  disabled: boolean
  onClick: () => void
  inApp: boolean
  variant: 'primary' | 'ghost'
}) {
  // Digital purchases inside the iOS app must go through native in-app
  // purchase (App Store guideline 3.1.1), so there is no buy button at all.
  if (inApp) {
    return (
      <p className="mt-4 rounded-xl border border-courtline bg-ink-800 px-4 py-3 text-center text-xs text-chalk-dim">
        Visit learnhoops.com on the web to start an organization plan.
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-4 w-full rounded-xl px-6 py-3 font-black transition-colors disabled:opacity-50 ${
        variant === 'primary'
          ? 'bg-ember-500 hover:bg-ember-400 text-ink-950'
          : 'border border-courtline bg-ink-800 text-chalk hover:border-chalk-dim/40'
      }`}
    >
      {loading ? 'Starting checkout…' : label}
    </button>
  )
}
