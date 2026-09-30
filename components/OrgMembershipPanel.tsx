'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  ShieldCheckIcon,
  UsersIcon,
} from 'lucide-react'
import OrgPlayerPicker, { type OrgPickerPlayer, type OrgPickerTeam } from '@/components/OrgPlayerPicker'
import { useRegionCurrency } from '@/lib/use-region-currency'
import { PLAYER_PLANS } from '@/lib/player-plans'
import {
  MEMBERSHIP_PLANS,
  MEMBERSHIP_TERMS,
  MEMBERSHIP_TIERS,
  MIN_MEMBERSHIP_SEATS,
  MAX_MEMBERSHIP_SEATS_PER_ORDER,
  membershipEndsAt,
  membershipQuote,
  membershipRetailMonthlyCents,
  membershipSeatsError,
  membershipTierFor,
  termLabel,
  type MembershipPlan,
  type MembershipQuote,
  type MembershipTerm,
  type MembershipTier,
} from '@/lib/org-membership-pricing'

// ── Shapes from GET /api/org/memberships (see MEMBERSHIP-CONTRACT.md) ───────

type BilledVia = 'org' | 'stripe' | 'apple' | 'legacy' | null

interface ApiCoverage {
  source: 'org' | 'personal' | 'legacy' | null
  plan: MembershipPlan | null
  endsAt: string | null
  billedVia: BilledVia
  orgName?: string
  /** Present when the club seat starts in the future. */
  startsAt?: string
}

interface ApiPlayer {
  /** null for a name-only invite (no account yet). */
  userId: string | null
  pendingId?: string
  name: string
  teamId: string
  teamName: string
  email: string
  coverage: ApiCoverage
  assignable: boolean
  reason?: 'no_account' | 'has_better_plan' | 'already_covered'
  note?: string
  /** The player's own paid plan, even while a club seat covers them. */
  ownPlan?: { plan: MembershipPlan; billedVia: BilledVia } | null
  setupIncomplete?: boolean
}

function ownPlanOf(p: ApiPlayer | undefined): { plan: MembershipPlan; billedVia: BilledVia } | null {
  if (!p) return null
  if (p.ownPlan) return p.ownPlan
  return p.coverage.source === 'personal' && p.coverage.plan ? { plan: p.coverage.plan, billedVia: p.coverage.billedVia } : null
}

/** Covered by a club seat now, or holding one that starts later. */
function clubCovered(p: ApiPlayer | undefined): boolean {
  return !!p && (p.coverage.source === 'org' || p.reason === 'already_covered')
}

function clubBadgeText(c: ApiCoverage): string {
  const plan = c.plan ? PLAN_NAME[c.plan] : 'Member'
  if (c.startsAt && new Date(c.startsAt).getTime() > Date.now()) {
    return `Club membership · ${plan} · starts ${shortDate(new Date(c.startsAt))}`
  }
  return `Covered by club · ${plan}${c.endsAt ? ` · until ${shortDate(lastDay(c.endsAt))}` : ''}`
}

interface ApiSeat {
  id: string
  orderId: string
  plan: MembershipPlan
  term: MembershipTerm
  status: 'unassigned' | 'assigned' | 'expired' | 'refunded' | 'pending_payment'
  startsAt: string
  endsAt: string
  player: { userId: string; name: string; teamId: string; teamName: string } | null
}

interface ApiData {
  liveSeats: number
  summary: { bought: number; assigned: number; unassigned: number; expiringIn30: number }
  orders: Array<{ id: string; plan: MembershipPlan; term: MembershipTerm; seats: number; totalCents: number; currency: string; status: string; startsAt: string; endsAt: string; createdAt: string }>
  seats: ApiSeat[]
  players: ApiPlayer[]
}

/** What the dashboard already knows about each team — the roster source of truth. */
export interface MembershipTeam extends OrgPickerTeam {
  members: Array<{ id: string; label: string; rosterPending: boolean }>
  /** Name-only invites: no account, so they can't hold a seat yet. */
  pendingPlayers: Array<{ id: string; label: string }>
}

async function fetchMemberships(): Promise<{ data?: ApiData; error?: string }> {
  try {
    const res = await fetch('/api/org/memberships', { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { error: json.error || 'Could not load your memberships.' }
    return { data: json as ApiData }
  } catch {
    return { error: 'Could not load your memberships. Check your connection and try again.' }
  }
}

// ── Formatting ──────────────────────────────────────────────────────────────

function money(cents: number, currency?: string | null): string {
  const whole = cents % 100 === 0
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
  return `$${n}${currency ? ` ${currency.toUpperCase()}` : ''}`
}

/** ends_at is exclusive, so the last covered day is the moment before it. */
function lastDay(endsAtIso: string): Date {
  return new Date(new Date(endsAtIso).getTime() - 1000)
}

/**
 * Membership dates are whole days stored at UTC midnight (the server parses
 * the start date as UTC), so they're always shown in UTC. Formatting them in
 * the viewer's zone shifts them a day (e.g. Sep 28 00:00Z is Sep 27 in
 * Toronto) and a DST change inside the term moved the last day too.
 */
function shortDate(d: Date, withYear?: boolean): string {
  const showYear = withYear ?? d.getUTCFullYear() !== new Date().getUTCFullYear()
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) })
}

function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 'YYYY-MM-DD' as UTC midnight — the same instant the server stores. */
function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

const PLAN_NAME: Record<MembershipPlan, string> = { player: 'Player', pro: 'Pro' }
const PLAN_RANK: Record<MembershipPlan, number> = { player: 1, pro: 2 }

function allowanceText(plan: MembershipPlan): string {
  const p = PLAYER_PLANS[plan]
  return `Up to ${p.weeklyLimit} analyses a week, ${p.monthlyLimit} a month`
}

// ── Small building blocks ───────────────────────────────────────────────────

const card = 'bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl p-5'
const h3 = 'text-base font-semibold text-gray-900 dark:text-chalk'
const sub = 'text-sm text-gray-500 dark:text-chalk-dim'
const primaryBtn =
  'inline-flex items-center justify-center gap-2 bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 dark:disabled:bg-ember-800 disabled:cursor-not-allowed text-ink-950 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors'
const quietBtn =
  'inline-flex items-center justify-center gap-1.5 border border-gray-200 dark:border-courtline text-gray-700 dark:text-chalk-dim hover:border-gray-300 dark:hover:text-chalk font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-60'

type BadgeTone = 'green' | 'gray' | 'blue' | 'amber'
const BADGE: Record<BadgeTone, string> = {
  green: 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400',
  gray: 'bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-chalk-dim',
  blue: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400',
  amber: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
}
function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${BADGE[tone]}`}>
      {children}
    </span>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ id: T; label: string; sub?: string }>
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 dark:text-chalk-dim mb-1.5">{label}</p>
      <div className={`grid gap-2 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label={label}>
        {options.map(o => {
          const active = o.id === value
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.id)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                active
                  ? 'border-ember-500 bg-ember-50 dark:bg-ember-500/15'
                  : 'border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 hover:border-gray-300'
              }`}
            >
              <span className={`block text-sm font-semibold ${active ? 'text-ember-700 dark:text-ember-400' : 'text-gray-900 dark:text-chalk'}`}>
                {o.label}
              </span>
              {o.sub && <span className="block text-xs text-gray-500 dark:text-chalk-dim mt-0.5">{o.sub}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── The panel ───────────────────────────────────────────────────────────────

/**
 * The org dashboard's Memberships tab (website only — the parent hides it in
 * the iOS app). Explains what a club membership is, sells blocks of seats
 * (plan, term, start date, count, optional players) through a review step and
 * Stripe Checkout, and manages the seats already bought.
 */
export default function OrgMembershipPanel({
  teams,
  orgEntitled,
}: {
  teams: MembershipTeam[]
  /** False when the org's plan has lapsed — buying is closed, managing stays open. */
  orgEntitled: boolean
}) {
  const regionCurrency = useRegionCurrency()
  const [data, setData] = useState<ApiData | null>(null)
  const [loadError, setLoadError] = useState('')

  const apply = useCallback((r: { data?: ApiData; error?: string }) => {
    if (r.data) { setData(r.data); setLoadError('') }
    else setLoadError(r.error || 'Could not load your memberships.')
  }, [])
  const load = useCallback(() => fetchMemberships().then(apply), [apply])

  useEffect(() => {
    let live = true
    fetchMemberships().then(r => { if (live) apply(r) })
    return () => { live = false }
  }, [apply])

  // ── Return from Stripe Checkout ─────────────────────────────────────────
  const [returnState, setReturnState] = useState<
    | { kind: 'working' }
    | { kind: 'success'; seats: number | null; plan: MembershipPlan | null; term: MembershipTerm | null }
    | { kind: 'pending' }
    | { kind: 'cancelled' }
    | null
  >(null)
  const handledReturn = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect -- reads the Stripe return
     URL once on mount; window.location isn't available during SSR render. */
  useEffect(() => {
    if (handledReturn.current) return
    handledReturn.current = true
    const params = new URLSearchParams(window.location.search)
    // Stripe comes back to ?tab=memberships&membership_session={id} (success)
    // or ?tab=memberships (cancelled). ?memberships=success&session_id= is
    // accepted too.
    const sessionId =
      params.get('membership_session') || params.get('session_id') || params.get('sessionId')
    const flag = params.get('memberships') ?? (sessionId ? 'success' : null)
    const tabParam = params.get('tab') === 'memberships'
    if (!flag && !tabParam) return
    // Land on this tab, and tidy the URL so a refresh doesn't re-run this.
    document.querySelector<HTMLButtonElement>('[data-tab="memberships"]')?.click()
    for (const k of ['memberships', 'membership_session', 'session_id', 'sessionId', 'tab']) params.delete(k)
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}#memberships`)

    if (!flag) return // plain link to the tab (or a cancelled checkout): nothing to confirm
    if (flag !== 'success') { setReturnState({ kind: 'cancelled' }); return }
    if (!sessionId) { setReturnState({ kind: 'pending' }); return }
    setReturnState({ kind: 'working' })
    ;(async () => {
      try {
        const res = await fetch('/api/org/memberships/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { setReturnState({ kind: 'pending' }); return }
        const o = json.order ?? {}
        setReturnState({
          kind: 'success',
          seats: typeof o.seats === 'number' ? o.seats : null,
          plan: o.plan ?? null,
          term: o.term ?? null,
        })
      } catch {
        setReturnState({ kind: 'pending' })
      }
      load()
    })()
  }, [load])
  /* eslint-enable react-hooks/set-state-in-effect */

  const liveSeats = data?.liveSeats ?? 0
  const currency = regionCurrency
  // What the buy form currently has chosen, so the price table can point at it.
  const [pick, setPick] = useState<{ plan: MembershipPlan; term: MembershipTerm; tier: MembershipTier; seats: number } | null>(null)

  // Coverage by player, and each team's roster merged with it.
  const byUser = useMemo(() => {
    const m = new Map<string, ApiPlayer>()
    for (const p of data?.players ?? []) if (p.userId && !m.has(p.userId)) m.set(p.userId, p)
    return m
  }, [data])

  return (
    <div className="space-y-4">
      {returnState && <ReturnBanner state={returnState} onDismiss={() => setReturnState(null)} />}

      <Explainer liveSeats={liveSeats} currency={currency} pick={orgEntitled ? pick : null} />

      {orgEntitled ? (
        <BuySection
          teams={teams}
          byUser={byUser}
          liveSeats={liveSeats}
          loaded={!!data}
          regionCurrency={currency}
          onPick={setPick}
        />
      ) : (
        <div className={`${card} flex gap-3`}>
          <InfoIcon className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className={h3}>Buying memberships needs an active organization plan</p>
            <p className={`${sub} mt-0.5`}>
              Reactivate your plan at the top of this page to buy memberships. Memberships you already bought keep working until they end.
            </p>
          </div>
        </div>
      )}

      <YourMemberships
        data={data}
        loadError={loadError}
        teams={teams}
        byUser={byUser}
        onChanged={load}
      />
    </div>
  )
}

// ── Return banner ───────────────────────────────────────────────────────────

function ReturnBanner({
  state,
  onDismiss,
}: {
  state:
    | { kind: 'working' }
    | { kind: 'success'; seats: number | null; plan: MembershipPlan | null; term: MembershipTerm | null }
    | { kind: 'pending' }
    | { kind: 'cancelled' }
  onDismiss: () => void
}) {
  if (state.kind === 'working') {
    return (
      <div role="status" className={`${card} flex items-center gap-3`}>
        <Loader2Icon className="w-5 h-5 text-ember-500 animate-spin shrink-0" aria-hidden />
        <p className="text-sm text-gray-700 dark:text-chalk">Confirming your payment…</p>
      </div>
    )
  }
  if (state.kind === 'cancelled') {
    return (
      <div role="status" className={`${card} flex items-start gap-3`}>
        <InfoIcon className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm text-gray-700 dark:text-chalk flex-1">Checkout was cancelled. Nothing was charged.</p>
        <button type="button" onClick={onDismiss} className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-chalk-dim">Dismiss</button>
      </div>
    )
  }
  const what =
    state.kind === 'success' && state.seats
      ? `${state.seats} ${state.plan ? PLAN_NAME[state.plan] + ' ' : ''}membership${state.seats === 1 ? '' : 's'}${state.term ? ` (${termLabel(state.term)})` : ''}`
      : 'Your memberships'
  return (
    <div role="status" className="rounded-2xl border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 p-5 flex items-start gap-3">
      <CheckCircle2Icon className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
          {state.kind === 'success' ? 'Payment received' : 'Payment is being confirmed'}
        </p>
        <p className="text-sm text-green-800/80 dark:text-green-300/80 mt-0.5">
          {state.kind === 'success'
            ? `${what} ${state.seats === 1 ? 'is' : 'are'} ready. Any players you chose are covered and have been emailed. Give out the rest from the list below. A receipt is on its way to your inbox.`
            : 'Stripe is still confirming the payment. Your seats will appear below within a minute. Refresh the page if they don’t.'}
        </p>
      </div>
      <button type="button" onClick={onDismiss} className="text-xs font-semibold text-green-800/70 hover:text-green-900 dark:text-green-300/70">Dismiss</button>
    </div>
  )
}

// ── What a membership is + the price table ──────────────────────────────────

function Explainer({
  liveSeats,
  currency,
  pick,
}: {
  liveSeats: number
  currency: string | null
  pick: { plan: MembershipPlan; term: MembershipTerm; tier: MembershipTier; seats: number } | null
}) {
  const currentTier = liveSeats > 0 ? membershipTierFor(liveSeats) : null
  const highlightTier = pick?.tier ?? currentTier
  return (
    <div className={`${card} space-y-5`}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-ember-500/10 text-ember-600 dark:text-ember-400 flex items-center justify-center">
          <ShieldCheckIcon className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className={h3}>Club memberships</h3>
          <p className={`${sub} mt-0.5`}>
            Pay once and give each player a membership for 3, 6 or 12 months. It covers the shots a player
            uploads from their own account, every week until it ends, with nothing to top up. Shots a coach
            uploads for a player still use tokens.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MEMBERSHIP_PLANS.map(plan => (
          <div key={plan} className="rounded-xl border border-gray-200 dark:border-courtline px-4 py-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-chalk">{PLAN_NAME[plan]}</p>
            <p className="text-sm text-gray-600 dark:text-chalk-dim mt-0.5">{allowanceText(plan)}.</p>
            <p className="text-xs text-gray-400 dark:text-chalk-dim mt-1">
              {plan === 'player' ? 'Steady feedback for most players.' : 'For players training most days.'}{' '}
              Regular price {money(PLAYER_PLANS[plan].monthlyCents)}/month or {money(PLAYER_PLANS[plan].annualTotalCents)}/year.
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-chalk-dim -mt-2">
        Unused analyses don&apos;t carry over. Memberships are paid once, up front, and don&apos;t renew on their own.
      </p>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-chalk">Price per player</p>
          <p className="text-xs text-gray-500 dark:text-chalk-dim">
            {currentTier && pick && pick.seats > 0
              ? `You have ${liveSeats} active membership${liveSeats === 1 ? '' : 's'}. Adding ${pick.seats} makes ${liveSeats + pick.seats}, so you get the ${pick.tier}+ price.`
              : currentTier
                ? `You have ${liveSeats} active membership${liveSeats === 1 ? '' : 's'}. New ones are priced on that total plus the ones you add.`
                : `The more players you cover, the lower the price. Minimum ${MIN_MEMBERSHIP_SEATS}.`}
            {currency ? ` Prices in ${currency}.` : ''}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {MEMBERSHIP_PLANS.map(plan => (
            <PriceTable
              key={plan}
              plan={plan}
              highlightTier={highlightTier}
              pickedTerm={pick?.plan === plan ? pick.term : null}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function PriceTable({
  plan,
  highlightTier,
  pickedTerm,
}: {
  plan: MembershipPlan
  highlightTier: MembershipTier | null
  /** The term chosen below, when it's for this plan — that cell gets a ring. */
  pickedTerm: MembershipTerm | null
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-courtline overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <caption className="sr-only">{PLAN_NAME[plan]} membership prices per player</caption>
        <thead>
          <tr className="bg-gray-50 dark:bg-ink-950/60 text-xs text-gray-500 dark:text-chalk-dim">
            <th scope="col" className="text-left font-semibold px-3 py-2 w-[30%]">{PLAN_NAME[plan]}</th>
            {MEMBERSHIP_TIERS.map(t => (
              <th
                key={t}
                scope="col"
                className={`text-right font-semibold px-2 py-2 ${
                  highlightTier === t ? 'text-ember-700 dark:text-ember-400 bg-ember-500/10' : ''
                }`}
              >
                {t}+ players
                {highlightTier === t && <span className="block text-[10px] font-semibold">Your price</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-courtline">
          {MEMBERSHIP_TERMS.map(term => (
            <tr key={term.id}>
              <th scope="row" className="text-left font-medium text-gray-700 dark:text-chalk px-3 py-2">{term.label}</th>
              {MEMBERSHIP_TIERS.map(t => {
                const q = membershipQuote(plan, term.id, t, 0)
                const picked = pickedTerm === term.id && highlightTier === t
                return (
                  <td
                    key={t}
                    aria-current={picked ? 'true' : undefined}
                    className={`text-right px-2 py-2 tabular-nums ${highlightTier === t ? 'bg-ember-500/10' : ''} ${
                      picked ? 'ring-2 ring-inset ring-ember-500 rounded-md' : ''
                    }`}
                  >
                    <span className="block font-semibold text-gray-900 dark:text-chalk">{money(q.unitCents)}</span>
                    <span className="block text-[11px] text-gray-500 dark:text-chalk-dim">
                      {money(q.perMonthCents)}<span className="sm:hidden">/mo</span><span className="hidden sm:inline">/month</span>
                    </span>
                    <span className="block text-[11px] text-green-700 dark:text-green-400">save {q.savingsPercent}%</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Buy ─────────────────────────────────────────────────────────────────────

function BuySection({
  teams,
  byUser,
  liveSeats,
  loaded,
  regionCurrency,
  onPick,
}: {
  teams: MembershipTeam[]
  byUser: Map<string, ApiPlayer>
  liveSeats: number
  loaded: boolean
  regionCurrency: string | null
  onPick: (p: { plan: MembershipPlan; term: MembershipTerm; tier: MembershipTier; seats: number }) => void
}) {
  const today = useMemo(() => localYmd(new Date()), [])
  const maxStart = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 60)
    return localYmd(d)
  }, [])

  const [plan, setPlan] = useState<MembershipPlan>('player')
  const [term, setTerm] = useState<MembershipTerm>('m6')
  const [startDate, setStartDate] = useState(today)
  const [seatsText, setSeatsText] = useState(String(MIN_MEMBERSHIP_SEATS))
  const [choosePlayers, setChoosePlayers] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const minSeats = liveSeats >= MIN_MEMBERSHIP_SEATS ? 1 : MIN_MEMBERSHIP_SEATS
  const seatsNum = parseInt(seatsText, 10)
  const seats = Number.isNaN(seatsNum) ? 0 : seatsNum
  const chosenIds = choosePlayers ? [...selected] : []
  const seatsError =
    seats < chosenIds.length
      ? `You chose ${chosenIds.length} players, so you need at least ${chosenIds.length} memberships.`
      : membershipSeatsError(seats, liveSeats)

  const startError =
    !startDate || startDate < today || startDate > maxStart
      ? 'Pick a start date between today and 60 days from now.'
      : ''

  // Instant price from the shared pricing module; the server's quote replaces
  // it a moment later and is what checkout charges.
  const localQuote: MembershipQuote | null = useMemo(() => {
    if (seatsError) return null
    try { return membershipQuote(plan, term, seats, liveSeats) } catch { return null }
  }, [plan, term, seats, liveSeats, seatsError])

  const [serverQuote, setServerQuote] = useState<(MembershipQuote & { currency?: string; key: string }) | null>(null)
  const quoteKey = `${plan}|${term}|${seats}|${liveSeats}`
  useEffect(() => {
    if (seatsError) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/org/memberships/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, term, seats }),
          signal: ctrl.signal,
        })
        if (!res.ok) return
        const q = await res.json()
        if (typeof q.totalCents === 'number') setServerQuote({ ...q, key: quoteKey })
      } catch {
        // Aborted or offline — the local figure stays on screen.
      }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [plan, term, seats, seatsError, quoteKey])

  const quote = serverQuote && serverQuote.key === quoteKey ? serverQuote : localQuote
  const pickTier: MembershipTier = quote?.tier ?? membershipTierFor(liveSeats + Math.max(seats, 0))
  useEffect(() => { onPick({ plan, term, tier: pickTier, seats: seatsError ? 0 : seats }) }, [plan, term, pickTier, seats, seatsError, onPick])
  const currency = (serverQuote?.currency ?? regionCurrency ?? null)?.toUpperCase() ?? null

  // When the chosen players outnumber the seats, grow the seat count to match.
  function onSelect(next: Set<string>) {
    setSelected(next)
    if (next.size > seats) setSeatsText(String(next.size))
  }

  // Picker rows: every rostered player, marked by what a seat would mean.
  const pickerPlayers: OrgPickerPlayer[] = useMemo(() => {
    const rows: OrgPickerPlayer[] = []
    for (const t of teams) {
      for (const m of t.members) {
        const api = byUser.get(m.id)
        const row: OrgPickerPlayer = { id: m.id, label: m.label, teamId: t.id }
        const c = api?.coverage
        const own = ownPlanOf(api)
        if (clubCovered(api)) {
          row.disabled = true
          row.note = c?.startsAt
            ? `Club membership already starts ${shortDate(new Date(c.startsAt))}`
            : `Already covered by the club${c?.endsAt ? ` until ${shortDate(lastDay(c.endsAt))}` : ''}`
        } else if (c?.source === 'legacy') {
          row.disabled = true
          row.note = 'Already has unlimited access'
        } else if (own && PLAN_RANK[own.plan] > PLAN_RANK[plan]) {
          row.disabled = true
          row.note = `Has own ${PLAN_NAME[own.plan]} plan — choose ${PLAN_NAME[own.plan]} above to include them`
        } else if (own) {
          if (own.billedVia === 'apple') {
            row.note = `Has own ${PLAN_NAME[own.plan]} plan and pays via App Store — they’ll get steps to cancel it`
            row.noteTone = 'warn'
          } else {
            row.note = `Has own ${PLAN_NAME[own.plan]} plan — their plan pauses while the club pays`
            row.noteTone = 'info'
          }
        } else if (api && !api.assignable && api.reason === 'no_account') {
          row.disabled = true
          row.note = 'Add an email to give a membership'
        } else if (m.rosterPending) {
          row.note = 'Account setup not finished — they’re covered as soon as they sign in'
        }
        rows.push(row)
      }
      for (const p of t.pendingPlayers) {
        rows.push({ id: `pending:${p.id}`, label: p.label, teamId: t.id, disabled: true, note: 'Add an email to give a membership' })
      }
    }
    return rows
  }, [teams, byUser, plan])

  const pickerTeams = useMemo(
    () => teams.map(t => ({ ...t, memberCount: t.members.length + t.pendingPlayers.length })),
    [teams],
  )

  // Drop ticks that stopped being valid (e.g. switching plan doesn't disable
  // anyone today, but coverage can change after a reload).
  const disabledIds = useMemo(() => new Set(pickerPlayers.filter(p => p.disabled).map(p => p.id)), [pickerPlayers])
  const validChosen = chosenIds.filter(id => !disabledIds.has(id))

  const startsAt = fromYmd(startDate || today)
  const endsAt = membershipEndsAt(startsAt, term)
  const coverLast = new Date(endsAt.getTime() - 1000)

  const canReview = loaded && !seatsError && !startError && !!quote

  const labelById = useMemo(() => {
    const m = new Map<string, { label: string; team: string; note?: React.ReactNode; tone?: string }>()
    for (const p of pickerPlayers) {
      const team = teams.find(t => t.id === p.teamId)?.name ?? ''
      if (!m.has(p.id)) m.set(p.id, { label: p.label, team, note: p.note, tone: p.noteTone })
    }
    return m
  }, [pickerPlayers, teams])

  async function checkout() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/org/memberships/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, term, startDate, seats, userIds: validChosen }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.url) { window.location.assign(json.url); return }
      setError(json.error || 'Could not start checkout. Please try again.')
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  if (step === 'review' && quote) {
    const unassigned = seats - validChosen.length
    const warnRows = validChosen.map(id => labelById.get(id)).filter(r => r && r.tone && r.tone !== 'muted')
    return (
      <div id="buy-memberships" className={`${card} space-y-4 scroll-mt-24`}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setStep('form'); setError('') }} className="p-1 -ml-1 rounded-lg text-gray-500 hover:text-gray-800 dark:text-chalk-dim dark:hover:text-chalk" aria-label="Back to edit">
            <ArrowLeftIcon className="w-4 h-4" aria-hidden />
          </button>
          <h3 className={h3}>Review your order</h3>
        </div>

        <dl className="rounded-xl border border-gray-200 dark:border-courtline divide-y divide-gray-100 dark:divide-courtline text-sm">
          {[
            ['Plan', `${PLAN_NAME[plan]} — ${allowanceText(plan).toLowerCase()}`],
            ['Length', termLabel(term)],
            ['Covers', `${shortDate(startsAt, true)} to ${shortDate(coverLast, true)}`],
            ['Memberships', `${seats}`],
            ['Price per player', `${money(quote.unitCents)} · ${money(quote.perMonthCents)}/month · save ${quote.savingsPercent}% (price for ${quote.tier}+ players, vs ${money(membershipRetailMonthlyCents(plan))}/month on a personal plan)`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 px-4 py-2.5">
              <dt className="sm:w-36 shrink-0 text-gray-500 dark:text-chalk-dim">{k}</dt>
              <dd className="text-gray-900 dark:text-chalk min-w-0 break-words">{v}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 px-4 py-3 bg-gray-50 dark:bg-ink-950/60">
            <dt className="font-semibold text-gray-900 dark:text-chalk">Total today</dt>
            <dd className="text-lg font-bold text-gray-900 dark:text-chalk tabular-nums">{money(quote.totalCents, currency)}</dd>
          </div>
        </dl>

        <div className="text-sm text-gray-600 dark:text-chalk-dim space-y-1.5">
          {validChosen.length > 0 ? (
            <p>
              <span className="font-semibold text-gray-900 dark:text-chalk">{validChosen.length}</span> player
              {validChosen.length === 1 ? '' : 's'} will be covered as soon as payment goes through, and emailed.
              {unassigned > 0 && ` The other ${unassigned} membership${unassigned === 1 ? '' : 's'} wait${unassigned === 1 ? 's' : ''} for you to give out.`}
            </p>
          ) : (
            <p>All {seats} memberships wait in your account until you give them to players below.</p>
          )}
          {validChosen.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {validChosen.slice(0, 40).map(id => (
                <li key={id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-ink-800 text-gray-700 dark:text-chalk-dim">
                  {labelById.get(id)?.label ?? 'Player'}
                </li>
              ))}
              {validChosen.length > 40 && <li className="text-xs text-gray-500 px-1">+{validChosen.length - 40} more</li>}
            </ul>
          )}
          {warnRows.length > 0 && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 mt-2">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">Players who already have their own plan</p>
              <ul className="text-xs text-amber-800 dark:text-amber-300/90 space-y-0.5">
                {warnRows.map((r, i) => <li key={i}>{r!.label}: {r!.note}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-chalk-dim pt-1">
            One payment, no renewal. You can move a membership to a different player at any time.
            Memberships you haven&apos;t given out can be refunded within 14 days of purchase — email{' '}
            <a href="mailto:support@learnhoops.com" className="underline hover:text-gray-600 dark:hover:text-chalk">support@learnhoops.com</a>.
          </p>
        </div>

        {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={() => setStep('form')} className={`${quietBtn} py-2.5 text-sm`} disabled={busy}>
            Edit order
          </button>
          <button type="button" onClick={checkout} disabled={busy} className={primaryBtn}>
            {busy ? <><Loader2Icon className="w-4 h-4 animate-spin" aria-hidden /> Opening secure checkout…</> : `Continue to payment — ${money(quote.totalCents)}`}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-chalk-dim text-center sm:text-right">
          Card, Apple Pay and Google Pay are accepted on the next page.
        </p>
      </div>
    )
  }

  return (
    <div id="buy-memberships" className={`${card} space-y-5 scroll-mt-24`}>
      <div>
        <h3 className={h3}>Buy memberships</h3>
        <p className={`${sub} mt-0.5`}>Choose a plan and how long it lasts. You can pick players now or give memberships out later.</p>
      </div>

      <Segmented
        label="Plan"
        value={plan}
        onChange={setPlan}
        options={MEMBERSHIP_PLANS.map(p => ({
          id: p,
          label: PLAN_NAME[p],
          sub: `${PLAYER_PLANS[p].weeklyLimit} a week · ${PLAYER_PLANS[p].monthlyLimit} a month`,
        }))}
      />
      <Segmented
        label="Length"
        value={term}
        onChange={setTerm}
        options={MEMBERSHIP_TERMS.map(t => ({ id: t.id, label: t.label }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600 dark:text-chalk-dim flex items-center gap-1.5 mb-1.5">
            <CalendarIcon className="w-3.5 h-3.5" aria-hidden /> Start date
          </span>
          <input
            type="date"
            value={startDate}
            min={today}
            max={maxStart}
            onChange={e => setStartDate(e.target.value)}
            className="w-full border border-gray-200 dark:border-courtline rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 dark:[color-scheme:dark] focus:outline-none focus:border-ember-500"
          />
          <span className="block text-xs text-gray-500 dark:text-chalk-dim mt-1">
            {startError || `Covers ${shortDate(startsAt, true)} to ${shortDate(coverLast, true)}. Start up to 60 days ahead.`}
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600 dark:text-chalk-dim flex items-center gap-1.5 mb-1.5">
            <UsersIcon className="w-3.5 h-3.5" aria-hidden /> Number of players
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={Math.max(minSeats, validChosen.length)}
            max={MAX_MEMBERSHIP_SEATS_PER_ORDER}
            value={seatsText}
            onChange={e => setSeatsText(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            onBlur={() => { if (seats < Math.max(minSeats, validChosen.length)) setSeatsText(String(Math.max(minSeats, validChosen.length))) }}
            className="w-full border border-gray-200 dark:border-courtline rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 focus:outline-none focus:border-ember-500 tabular-nums"
          />
          <span className={`block text-xs mt-1 ${seatsError && seatsText !== '' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-chalk-dim'}`}>
            {seatsError && seatsText !== ''
              ? seatsError
              : minSeats > 1
                ? `Minimum ${MIN_MEMBERSHIP_SEATS} for your first order.`
                : `You already have ${liveSeats} active, so any number works.`}
          </span>
        </label>
      </div>

      {/* Choose players now (optional) */}
      <div className="rounded-xl border border-gray-200 dark:border-courtline">
        <label className="flex items-start gap-3 px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={choosePlayers}
            onChange={e => setChoosePlayers(e.target.checked)}
            className="w-4 h-4 mt-0.5 accent-ember-500 shrink-0"
          />
          <span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-chalk">Choose players now</span>
            <span className="block text-xs text-gray-500 dark:text-chalk-dim mt-0.5">
              Optional. They&apos;re covered the moment you pay. Otherwise give memberships out later from the list below.
            </span>
          </span>
        </label>
        {choosePlayers && (
          <div className="px-4 pb-4 space-y-2">
            <OrgPlayerPicker
              teams={pickerTeams}
              players={pickerPlayers}
              selected={selected}
              onChange={onSelect}
              keepSelectionAcrossTeams
            />
            <p className="text-xs text-gray-500 dark:text-chalk-dim">
              {validChosen.length === 0
                ? 'No players chosen yet.'
                : `${validChosen.length} player${validChosen.length === 1 ? '' : 's'} chosen${seats > validChosen.length ? `, ${seats - validChosen.length} membership${seats - validChosen.length === 1 ? '' : 's'} left to give out later` : ''}.`}
            </p>
          </div>
        )}
      </div>

      {/* Live quote */}
      <div className="rounded-xl bg-gray-50 dark:bg-ink-950/60 border border-gray-200 dark:border-courtline px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {quote && !seatsError ? (
          <div className="min-w-0">
            <p className="text-sm text-gray-600 dark:text-chalk-dim">
              {seats} × {money(quote.unitCents)} <span className="text-gray-400">· {money(quote.perMonthCents)}/month each</span>
            </p>
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mt-0.5">
              Save {quote.savingsPercent}% vs {money(membershipRetailMonthlyCents(plan))}/month on a personal plan
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-chalk-dim">Enter the number of players to see your price.</p>
        )}
        <p className="text-xl font-bold text-gray-900 dark:text-chalk tabular-nums">
          {quote && !seatsError ? money(quote.totalCents, currency) : '—'}
        </p>
      </div>

      <div className="flex justify-end">
        <button type="button" disabled={!canReview} onClick={() => { setError(''); setStep('review') }} className={`${primaryBtn} w-full sm:w-auto`}>
          Review order
        </button>
      </div>
    </div>
  )
}

// ── Your memberships ────────────────────────────────────────────────────────

type ActKind = 'assign' | 'unassign' | 'move'

/** Same key the "Ready to give out" groups use: plan, term and end day. */
function seatGroupKey(s: { plan: MembershipPlan; term: MembershipTerm; endsAt: string }): string {
  return `${s.plan}|${s.term}|${s.endsAt.slice(0, 10)}`
}

function YourMemberships({
  data,
  loadError,
  teams,
  byUser,
  onChanged,
}: {
  data: ApiData | null
  loadError: string
  teams: MembershipTeam[]
  byUser: Map<string, ApiPlayer>
  onChanged: () => Promise<void> | void
}) {
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: ActKind; userId: string; seatId: string } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [openTeams, setOpenTeams] = useState<Set<string>>(() => new Set(teams.slice(0, 1).map(t => t.id)))

  const [now] = useState(() => Date.now())
  // Unassigned, usable seats grouped by what they are (plan, term, end date).
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; plan: MembershipPlan; term: MembershipTerm; endsAt: string; startsAt: string; seatIds: string[] }>()
    for (const s of data?.seats ?? []) {
      if (s.status !== 'unassigned') continue
      if (new Date(s.endsAt).getTime() <= now) continue
      const key = seatGroupKey(s)
      const g = m.get(key) ?? { key, plan: s.plan, term: s.term, endsAt: s.endsAt, startsAt: s.startsAt, seatIds: [] }
      g.seatIds.push(s.id)
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => PLAN_RANK[b.plan] - PLAN_RANK[a.plan] || a.endsAt.localeCompare(b.endsAt))
  }, [data, now])
  const pendingPayment = (data?.seats ?? []).filter(s => s.status === 'pending_payment').length

  const [groupKey, setGroupKey] = useState('')
  const activeGroup = groups.find(g => g.key === groupKey) ?? groups[0] ?? null

  const seatByUser = useMemo(() => {
    const m = new Map<string, ApiSeat>()
    for (const s of data?.seats ?? []) if (s.status === 'assigned' && s.player) m.set(s.player.userId, s)
    return m
  }, [data])

  async function act(kind: ActKind, seatId: string, userId: string, name: string) {
    setBusyUser(userId)
    setMsg(null)
    try {
      const res = await fetch(`/api/org/memberships/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'unassign' ? { seatId } : { seatId, userId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ ok: false, text: json.error || 'That didn’t work. Please try again.' })
      } else {
        const to = json.seat as { plan?: MembershipPlan; endsAt?: string } | undefined
        setMsg({
          ok: true,
          text:
            kind === 'assign'
              ? `${name} is now covered by the club.`
              : kind === 'move'
                ? `${name} now has ${to?.plan ? `a ${PLAN_NAME[to.plan]}` : 'the new'} membership${to?.endsAt ? ` through ${shortDate(lastDay(to.endsAt), true)}` : ''}. Their old one is ready to give out again.`
                : `${name}'s membership is back with the ones you haven't given out.`,
        })
        await onChanged()
      }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' })
    }
    setBusyUser(null)
    setConfirm(null)
  }

  function toggleTeam(id: string) {
    setOpenTeams(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const s = data?.summary

  return (
    <div className={`${card} space-y-4`}>
      <div>
        <h3 className={h3}>Your memberships</h3>
        <p className={`${sub} mt-0.5`}>Who&apos;s covered on each team. Give a membership to a player or move it to someone else.</p>
      </div>

      {loadError && !data && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}
      {!data && !loadError && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-chalk-dim">
          <Loader2Icon className="w-4 h-4 animate-spin" aria-hidden /> Loading…
        </div>
      )}

      {data && s && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Bought', value: s.bought, note: 'still active' },
              { label: 'Given out', value: s.assigned, note: 'to players' },
              { label: 'Not given out', value: s.unassigned, note: 'ready to give out', accent: s.unassigned > 0 },
              { label: 'Ending soon', value: s.expiringIn30, note: 'in the next 30 days', warn: s.expiringIn30 > 0 },
            ].map(c => (
              <div
                key={c.label}
                className={`rounded-xl border px-3 py-2.5 ${
                  c.accent ? 'border-ember-500/40 bg-ember-500/10' : c.warn ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10' : 'border-gray-200 dark:border-courtline'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-chalk-dim">{c.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-chalk tabular-nums leading-tight">{c.value}</p>
                <p className="text-xs text-gray-400 dark:text-chalk-dim">{c.note}</p>
              </div>
            ))}
          </div>

          {s.unassigned > 0 && (
            <p className="text-xs text-gray-500 dark:text-chalk-dim">
              Memberships you haven&apos;t given out can be refunded within 14 days of purchase — email{' '}
              <a href="mailto:support@learnhoops.com" className="underline hover:text-gray-700 dark:hover:text-chalk">support@learnhoops.com</a>.
            </p>
          )}

          {pendingPayment > 0 && (
            <p className="text-xs text-gray-500 dark:text-chalk-dim">
              {pendingPayment} membership{pendingPayment === 1 ? ' is' : 's are'} waiting for a checkout to finish.
            </p>
          )}

          {groups.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-courtline px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-chalk">Ready to give out</p>
              {groups.length === 1 ? (
                <p className="text-sm text-gray-600 dark:text-chalk-dim">
                  {groups[0].seatIds.length} {PLAN_NAME[groups[0].plan]} membership{groups[0].seatIds.length === 1 ? '' : 's'} ·{' '}
                  until {shortDate(lastDay(groups[0].endsAt))}. Use &ldquo;Give membership&rdquo; next to a player below, or &ldquo;Switch&rdquo; to move a covered player onto one.
                </p>
              ) : (
                <label className="block text-sm text-gray-600 dark:text-chalk-dim">
                  <span className="block mb-1">Give out from:</span>
                  <select
                    value={activeGroup?.key ?? ''}
                    onChange={e => setGroupKey(e.target.value)}
                    className="w-full border border-gray-200 dark:border-courtline rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-chalk bg-white dark:bg-ink-900"
                  >
                    {groups.map(g => (
                      <option key={g.key} value={g.key}>
                        {g.seatIds.length} × {PLAN_NAME[g.plan]} · {termLabel(g.term)} · until {shortDate(lastDay(g.endsAt), true)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {msg && (
            <p role="status" className={`text-sm font-medium ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>
          )}

          {teams.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-chalk-dim">No teams yet — add one in the Teams tab.</p>
          ) : (
            <div className="space-y-2">
              {teams.map(t => {
                const open = openTeams.has(t.id)
                const covered = t.members.filter(m => byUser.get(m.id)?.coverage.source === 'org').length
                const total = t.members.length + t.pendingPlayers.length
                return (
                  <div key={t.id} className="rounded-xl border border-gray-200 dark:border-courtline overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleTeam(t.id)}
                      aria-expanded={open}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 dark:bg-ink-950/60 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-chalk truncate">
                          {t.name}{t.ageGroup ? ` · ${t.ageGroup}` : ''}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-chalk-dim">
                          {covered} of {total} covered by the club
                        </span>
                      </span>
                      <span className="text-gray-400 dark:text-chalk-dim text-lg leading-none" aria-hidden>{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <ul className="divide-y divide-gray-100 dark:divide-courtline">
                        {total === 0 && <li className="px-4 py-3 text-sm text-gray-400 dark:text-chalk-dim">No players on this team yet.</li>}
                        {t.members.map(m => {
                          const api = byUser.get(m.id)
                          const c = api?.coverage
                          const seat = seatByUser.get(m.id)
                          const isOrg = clubCovered(api)
                          const own = ownPlanOf(api)
                          const confirming = confirm && confirm.userId === m.id ? confirm : null
                          const planTooLow = !!own && !!activeGroup && PLAN_RANK[own.plan] > PLAN_RANK[activeGroup.plan]
                          const canAssign =
                            !isOrg && !seat && !!activeGroup && c?.source !== 'legacy' && !planTooLow && (api ? api.assignable : true)
                          // Switch a covered player to the membership picked above, in one
                          // step (one email to the player, never "removed" then "covered").
                          const canMove =
                            !!seat && !!activeGroup && seatGroupKey(seat) !== activeGroup.key && !planTooLow &&
                            new Date(activeGroup.startsAt).getTime() <= now
                          const ownPlanNote = own
                            ? own.billedVia === 'apple'
                              ? 'They pay through the App Store, which we can’t pause. We’ll email them steps to cancel it.'
                              : 'Their own plan pauses while the club pays, and restarts when the membership ends.'
                            : null
                          return (
                            <li key={m.id} className="px-4 py-2.5">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <span className="text-sm text-gray-900 dark:text-chalk min-w-0 break-words flex-1 basis-40">{m.label}</span>
                                <span className="flex flex-wrap items-center gap-1.5">
                                  {isOrg && c ? (
                                    <Badge tone="green">{clubBadgeText(c)}</Badge>
                                  ) : seat ? (
                                    <Badge tone="amber">Club seat not in use · own plan is higher</Badge>
                                  ) : c?.source === 'legacy' ? (
                                    <Badge tone="blue">Own plan · Unlimited</Badge>
                                  ) : own ? (
                                    <Badge tone="blue">Own plan · {PLAN_NAME[own.plan]}</Badge>
                                  ) : (
                                    <Badge tone="gray">Not covered</Badge>
                                  )}
                                  {isOrg && own && (
                                    <Badge tone={own.billedVia === 'apple' ? 'amber' : 'gray'}>{own.billedVia === 'apple' ? `Own ${PLAN_NAME[own.plan]} plan · still billed by App Store` : `Own ${PLAN_NAME[own.plan]} plan paused`}</Badge>
                                  )}
                                  {m.rosterPending && <Badge tone="amber">Setup incomplete</Badge>}
                                </span>
                                {!confirming && seat && canMove && (
                                  <button type="button" className={quietBtn} disabled={!!busyUser} onClick={() => setConfirm({ kind: 'move', userId: m.id, seatId: activeGroup!.seatIds[0] })}>
                                    {busyUser === m.id ? 'Switching…' : `Switch to ${PLAN_NAME[activeGroup!.plan]} · ${termLabel(activeGroup!.term)}`}
                                  </button>
                                )}
                                {!confirming && seat && (
                                  <button type="button" className={quietBtn} disabled={!!busyUser} onClick={() => setConfirm({ kind: 'unassign', userId: m.id, seatId: seat.id })}>
                                    Take back
                                  </button>
                                )}
                                {!confirming && !isOrg && !seat && planTooLow && (
                                  <span className="text-xs text-gray-500 dark:text-chalk-dim">Needs a {PLAN_NAME[own!.plan]} membership</span>
                                )}
                                {!confirming && canAssign && (
                                  <button
                                    type="button"
                                    className={quietBtn}
                                    disabled={!!busyUser}
                                    onClick={() => {
                                      const seatId = activeGroup!.seatIds[0]
                                      if (ownPlanNote) setConfirm({ kind: 'assign', userId: m.id, seatId })
                                      else act('assign', seatId, m.id, m.label)
                                    }}
                                  >
                                    {busyUser === m.id ? 'Giving…' : 'Give membership'}
                                  </button>
                                )}
                              </div>
                              {confirming && (
                                <div className="mt-2 rounded-lg bg-gray-50 dark:bg-ink-950/60 border border-gray-200 dark:border-courtline px-3 py-2 flex flex-wrap items-center gap-2">
                                  <p className="text-xs text-gray-700 dark:text-chalk-dim flex-1 basis-56">
                                    {confirming.kind === 'unassign'
                                      ? `Take back ${m.label}'s membership? They stop being covered now, and the membership goes back with the ones you haven't given out.`
                                      : confirming.kind === 'move' && activeGroup
                                        ? `Switch ${m.label} to a ${PLAN_NAME[activeGroup.plan]} membership (${termLabel(activeGroup.term).toLowerCase()}, through ${shortDate(lastDay(activeGroup.endsAt), true)})? They stay covered the whole time and get one email about the change. Their current membership goes back with the ones you haven't given out.`
                                        : ownPlanNote}
                                  </p>
                                  <button type="button" className={quietBtn} onClick={() => setConfirm(null)} disabled={!!busyUser}>Cancel</button>
                                  <button
                                    type="button"
                                    className={confirming.kind === 'unassign'
                                      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-60'
                                      : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ember-500 hover:bg-ember-400 text-ink-950 disabled:opacity-60'}
                                    disabled={!!busyUser}
                                    onClick={() => act(confirming.kind, confirming.seatId, m.id, m.label)}
                                  >
                                    {busyUser ? 'Saving…' : confirming.kind === 'unassign' ? 'Take back' : confirming.kind === 'move' ? 'Switch' : 'Give membership'}
                                  </button>
                                </div>
                              )}
                            </li>
                          )
                        })}
                        {t.pendingPlayers.map(p => (
                          <li key={p.id} className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 opacity-70">
                            <span className="text-sm text-gray-900 dark:text-chalk min-w-0 break-words flex-1 basis-40">{p.label}</span>
                            <Badge tone="gray">No account yet</Badge>
                            <span className="text-xs text-gray-500 dark:text-chalk-dim">Add an email to give a membership</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
