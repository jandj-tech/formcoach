'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, ZapIcon } from 'lucide-react'
import {
  annualPercentOff,
  annualSavingsCents,
  launchOfferMonthlyCents,
  LAUNCH_OFFER_MONTHS,
  LAUNCH_OFFER_PERCENT_OFF,
  ORG_ANNUAL_MONTHLY_CENTS,
  ORG_ANNUAL_TOTAL_CENTS,
  ORG_MONTHLY_CENTS,
  ORG_PLAN_FEATURES,
  orgUsd,
  type OrgPlan,
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
  const [loading, setLoading] = useState<OrgPlan | null>(null)
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
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  // Before the first tick, a deadline existing IS the offer being live — the
  // server only issues one when it just armed the window. That keeps the
  // discounted price on screen at first paint instead of flashing full price.
  const offerLive = deadline !== null && (remaining === null || remaining > 0)

  const buy = useCallback(
    async (plan: OrgPlan) => {
      setLoading(plan)
      setError('')
      try {
        const res = await fetch('/api/org/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Tell the server what we showed. It re-checks and refuses rather
          // than quietly charging full price for a button that said $7.49.
          body: JSON.stringify({ plan, offer: plan === 'monthly' && offerLive }),
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
    [offerLive, router],
  )

  const monthlyOfferCents = launchOfferMonthlyCents()

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-20">
      <div className="text-center space-y-3 pt-10 pb-8">
        <p className="eyebrow text-ember-400 select-none">Organization plan</p>
        <h1 className="font-display font-black uppercase text-3xl sm:text-4xl text-chalk">
          Get {orgName ? orgName : 'your club'} <span className="text-gradient-ember">on LearnHoops</span>
        </h1>
        <p className="text-chalk-dim text-sm max-w-lg mx-auto">
          One subscription covers your whole organization — every team, every coach, every
          player. No per-seat pricing.
        </p>
      </div>

      {/* Launch offer banner — only while the server says the offer is live. */}
      {offerLive && !inApp && (
        <div
          className="mb-6 flex items-center justify-center gap-3 rounded-2xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 text-center"
          role="status"
        >
          <ZapIcon className="w-4 h-4 text-ember-400 shrink-0" aria-hidden />
          <p className="text-sm text-chalk">
            <span className="font-bold text-ember-400">Launch offer</span> — {LAUNCH_OFFER_PERCENT_OFF}% off your
            first {LAUNCH_OFFER_MONTHS} months on the monthly plan.{' '}
            <span className="font-numeric font-bold text-chalk">
              {remaining === null ? '5:00' : formatRemaining(remaining)}
            </span>{' '}
            left.
          </p>
        </div>
      )}

      {error && (
        <p className="mb-4 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* ── Monthly ─────────────────────────────────────────── */}
        <PlanCard
          name="Monthly"
          blurb="Month to month, cancel any time"
          badge={offerLive ? `${LAUNCH_OFFER_PERCENT_OFF}% OFF` : null}
          highlight={offerLive}
        >
          <div className="flex items-end gap-2 flex-wrap">
            {offerLive && (
              <span className="font-numeric text-xl text-chalk-dim line-through">
                {orgUsd(ORG_MONTHLY_CENTS)}
              </span>
            )}
            <span className="font-numeric text-4xl font-black text-chalk">
              {orgUsd(offerLive ? monthlyOfferCents : ORG_MONTHLY_CENTS)}
            </span>
            <span className="text-chalk-dim text-sm pb-1">per month</span>
          </div>
          <p className="text-xs text-chalk-dim mt-1 min-h-[2rem]">
            {offerLive
              ? `for your first ${LAUNCH_OFFER_MONTHS} months, then ${orgUsd(ORG_MONTHLY_CENTS)}/month`
              : 'billed monthly'}
          </p>

          <BuyButton
            label="Get started monthly"
            loading={loading === 'monthly'}
            disabled={loading !== null}
            onClick={() => buy('monthly')}
            inApp={inApp}
            variant={offerLive ? 'primary' : 'ghost'}
          />
        </PlanCard>

        {/* ── Annual ──────────────────────────────────────────── */}
        <PlanCard
          name="Annual"
          blurb="Best value for a full season"
          badge={`${annualPercentOff()}% OFF`}
          highlight={!offerLive}
        >
          <div className="flex items-end gap-2 flex-wrap">
            <span className="font-numeric text-xl text-chalk-dim line-through">
              {orgUsd(ORG_MONTHLY_CENTS)}
            </span>
            <span className="font-numeric text-4xl font-black text-chalk">
              {orgUsd(ORG_ANNUAL_MONTHLY_CENTS)}
            </span>
            <span className="text-chalk-dim text-sm pb-1">per month</span>
          </div>
          <p className="text-xs text-chalk-dim mt-1 min-h-[2rem]">
            billed annually at {orgUsd(ORG_ANNUAL_TOTAL_CENTS)} — saves{' '}
            <span className="text-chalk font-semibold">{orgUsd(annualSavingsCents())}</span> a year
          </p>

          <BuyButton
            label="Get started annually"
            loading={loading === 'annual'}
            disabled={loading !== null}
            onClick={() => buy('annual')}
            inApp={inApp}
            variant={offerLive ? 'ghost' : 'primary'}
          />
        </PlanCard>
      </div>

      {/* ── What's included ─────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-courtline bg-ink-900 p-5 sm:p-6">
        <p className="eyebrow text-chalk-dim mb-4 select-none">Every plan includes</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ORG_PLAN_FEATURES.map((f) => (
            <li key={f.label} className="flex gap-2.5">
              <CheckIcon className="w-4 h-4 text-ember-400 shrink-0 mt-0.5" aria-hidden />
              <span className="text-sm text-chalk">
                {f.label}
                {f.note && <span className="block text-xs text-chalk-dim mt-0.5">{f.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-center text-xs text-chalk-dim">
        Your organization account is created as soon as your payment goes through. Cancel any
        time from your dashboard.
      </p>
    </div>
  )
}

function PlanCard({
  name,
  blurb,
  badge,
  highlight,
  children,
}: {
  name: string
  blurb: string
  badge: string | null
  highlight: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 flex flex-col ${
        highlight ? 'border-ember-500 bg-ember-500/[0.07]' : 'border-courtline bg-ink-900'
      }`}
    >
      <div className="flex items-center gap-2.5 mb-1">
        <h2 className="font-display font-black uppercase text-xl text-chalk">{name}</h2>
        {badge && (
          <span className="rounded-full bg-ember-500 px-2 py-0.5 text-[11px] font-black text-ink-950">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-chalk-dim mb-4">{blurb}</p>
      {children}
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
