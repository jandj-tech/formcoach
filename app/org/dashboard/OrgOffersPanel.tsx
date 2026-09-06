'use client'

import { useEffect, useMemo, useState } from 'react'
import { backendButton } from '@/components/backend/button-styles'
import { useIsInApp } from '@/lib/useIsInApp'
import { TIER_ORDER, TIER_LABELS, TIER_DESCRIPTIONS, tierRank, type VisibilityTier } from '@/lib/result-visibility'
import { effectivePriceCents, hasAnchorPrice, offerUsd, type OrgOffer } from '@/lib/org-offers'
import { copyToClipboard } from '@/lib/copy'
import { CopyIcon, ExternalLinkIcon, PlusIcon, Trash2Icon } from 'lucide-react'

// The Offers & Sales tab: what players see for free vs after buying, the
// org's sellable offers with their three price rungs, and who has paid.
// Selling is quote-gated — offers can be edited any time but only turned on
// once LearnHoops has set this org's revenue split.

const CARD = 'bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl'
const INPUT =
  'w-full border border-gray-200 dark:border-courtline rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 placeholder:text-gray-400 focus:outline-none focus:border-ember-500'
const LABEL = 'block text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-chalk-dim mb-1'

interface Selling {
  enabled: boolean
  requested: boolean
  platformSharePercent: number | null
}

interface OffersResponse {
  offers: OrgOffer[]
  selling: Selling
  teams: Array<{ id: string; name: string }>
  orgId: string
}

interface Settings {
  freeTier: VisibilityTier
  unlockTier: VisibilityTier
}

interface SaleRow {
  id: string
  createdAt: string
  buyerEmail: string
  buyerName: string | null
  offerTitle: string
  includesCourse: boolean
  includesBall: boolean
  includesBreakdown: boolean
  amountCents: number
  currency: string
  orgShareOwedCents: number
  refundedCents: number
  status: string
  shipStatus: string | null
}

interface Totals {
  currency: string
  grossCents: number
  orgShareCents: number
  paidOutCents: number
  owedCents: number
  saleCount: number
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

function dollars(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

function toCents(value: string): number | null {
  const t = value.trim()
  if (!t) return null
  const n = Number(t.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(json.error || 'Something went wrong')
  return json
}

async function fetchAll() {
  const [o, s, sales] = await Promise.all([
    jsonFetch<OffersResponse>('/api/org/offers'),
    jsonFetch<{ settings: Settings }>('/api/org/result-settings'),
    jsonFetch<{ sales: SaleRow[]; totals: Totals[] }>('/api/org/sales'),
  ])
  return { ...o, settings: s.settings, sales: sales.sales, totals: sales.totals }
}

// ---------------------------------------------------------------------------

function TierRadioGroup({
  title,
  hint,
  value,
  onChange,
  disabledBelow,
}: {
  title: string
  hint: string
  value: VisibilityTier
  onChange: (t: VisibilityTier) => void
  disabledBelow?: VisibilityTier
}) {
return (
  <fieldset className="space-y-2">
    <legend className="text-sm font-bold text-black dark:text-chalk">{title}</legend>
    <p className="text-xs text-gray-500 dark:text-chalk-dim -mt-1 mb-2">{hint}</p>
    {TIER_ORDER.map((t) => {
      const disabled = disabledBelow ? tierRank(t) < tierRank(disabledBelow) : false
      return (
        <label
          key={t}
          className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
            value === t
              ? 'border-ember-500 bg-ember-50 dark:bg-ember-500/10'
              : 'border-gray-200 dark:border-courtline hover:border-gray-300 dark:hover:border-chalk-dim/40'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name={title}
            className="mt-0.5 accent-ember-500"
            checked={value === t}
            disabled={disabled}
            onChange={() => onChange(t)}
          />
          <span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-chalk">{TIER_LABELS[t]}</span>
            <span className="block text-xs text-gray-500 dark:text-chalk-dim">{TIER_DESCRIPTIONS[t]}</span>
          </span>
        </label>
      )
    })}
  </fieldset>
)
}

function VisibilityCard({
  settings,
  onSaved,
  sellingEnabled,
  unlockOfferActive,
}: {
  settings: Settings
  onSaved: (s: Settings) => void
  sellingEnabled: boolean
  unlockOfferActive: boolean
}) {
  // Remounted by the parent (keyed on the saved settings) whenever the saved
  // values change, so no prop-to-state syncing effect is needed here.
  const [free, setFree] = useState<VisibilityTier>(settings.freeTier)
  const [unlock, setUnlock] = useState<VisibilityTier>(settings.unlockTier)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const paywalled = tierRank(free) < tierRank(unlock)
  const dirty = free !== settings.freeTier || unlock !== settings.unlockTier

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      await jsonFetch('/api/org/result-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeTier: free, unlockTier: unlock }),
      })
      onSaved({ freeTier: free, unlockTier: unlock })
      setMsg('Saved.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`${CARD} p-5 space-y-5`}>
      <div>
        <h2 className="text-lg font-black text-black dark:text-chalk">What players see</h2>
        <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
          Choose how much of the report a player gets with the email, and how much a purchase unlocks. Showing
          everything for free is a valid choice — that is the default.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TierRadioGroup
          title="Free with the email"
          hint="What the link shows before anyone pays."
          value={free}
          onChange={(t) => {
            setFree(t)
            if (tierRank(t) > tierRank(unlock)) setUnlock(t)
          }}
        />
        <TierRadioGroup
          title="After they buy"
          hint="What an unlock purchase reveals. Must show at least as much as the free level."
          value={unlock}
          onChange={setUnlock}
          disabledBelow={free}
        />
      </div>
      {paywalled && !(sellingEnabled && unlockOfferActive) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          This is a paywall, but nothing is for sale yet — players would see the free level with no way to unlock the
          rest. {sellingEnabled ? 'Turn on an offer that includes the full breakdown below.' : 'Request selling access below first.'}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !dirty} className={backendButton('primary')}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="text-xs text-gray-500 dark:text-chalk-dim">{msg}</span>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

// The public offers page — a link a coach can text or email to families so
// they can buy the class before a single shot has been graded.
function ShareOffersLink({ orgId }: { orgId: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!orgId) return null
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/offers/${orgId}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-chalk-dim">Your public offers page:</span>
      <button
        type="button"
        onClick={async () => {
          await copyToClipboard(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className={backendButton('secondary')}
      >
        <CopyIcon aria-hidden />
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <a href={`/offers/${orgId}`} target="_blank" rel="noopener noreferrer" className={backendButton('quiet')}>
        <ExternalLinkIcon aria-hidden />
        Open
      </a>
    </div>
  )
}

function SellingCard({ selling, orgId, onChange }: { selling: Selling; orgId: string | null; onChange: (s: Selling) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function request() {
    setBusy(true)
    setErr(null)
    try {
      await jsonFetch('/api/org/request-offers', { method: 'POST' })
      onChange({ ...selling, requested: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send the request')
    } finally {
      setBusy(false)
    }
  }
  if (selling.enabled) {
    const share = selling.platformSharePercent ?? 0
    return (
      <section className={`${CARD} p-5 flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-sm font-bold text-green-700 dark:text-green-400">Selling enabled</p>
          <p className="text-xs text-gray-500 dark:text-chalk-dim">
            LearnHoops share {share}% · your share {Math.round((100 - share) * 100) / 100}% of every sale (shipping
            excluded). LearnHoops collects payment and pays out your share.
          </p>
        </div>
        <ShareOffersLink orgId={orgId} />
      </section>
    )
  }
  return (
    <section className="bg-gradient-to-br from-ember-500 to-ember-600 text-white rounded-2xl p-5 sm:p-6 space-y-3">
      <h2 className="text-lg font-black">Sell to your families</h2>
      <p className="text-sm text-white/90 leading-relaxed max-w-2xl">
        Offer the full shot breakdown, the LearnHoops ball, and your Shooting Class right from each player&apos;s
        results page. LearnHoops handles checkout and payment and pays out your share. Pricing is worked out per
        organization — request access and we&apos;ll send your revenue-split quote.
      </p>
      {selling.requested ? (
        <div className="bg-white/15 rounded-xl px-4 py-3 text-sm">
          <p className="font-bold">Request received.</p>
          <p className="text-white/90">
            We&apos;ll email you your quote — usually within a day. You can set up your offers now; you&apos;ll be able to
            turn them on once selling is enabled.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={request}
            disabled={busy}
            className="inline-flex items-center rounded-xl bg-white text-ember-600 font-bold px-4 py-2 text-sm hover:bg-white/90 disabled:opacity-60"
          >
            {busy ? 'Sending…' : 'Request selling access'}
          </button>
          {err && <span className="text-sm font-semibold">{err}</span>}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function OfferCard({
  offer,
  teams,
  sellingEnabled,
  onChange,
  onDelete,
}: {
  offer: OrgOffer
  teams: Array<{ id: string; name: string }>
  sellingEnabled: boolean
  onChange: (o: OrgOffer) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState(offer.title)
  const [description, setDescription] = useState(offer.description ?? '')
  const [regular, setRegular] = useState(dollars(offer.regularPriceCents))
  const [club, setClub] = useState(dollars(offer.clubPriceCents))
  const [discount, setDiscount] = useState(dollars(offer.discountPriceCents))
  const [shipping, setShipping] = useState(dollars(offer.shippingCents))
  const [incBreakdown, setIncBreakdown] = useState(offer.includesBreakdown)
  const [incBall, setIncBall] = useState(offer.includesBall)
  const [incCourse, setIncCourse] = useState(offer.includesCourse)
  const [scope, setScope] = useState(offer.unlockScope)
  const [joinTeamId, setJoinTeamId] = useState(offer.joinTeamId ?? '')
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const preview = useMemo(() => {
    const r = toCents(regular)
    const c = toCents(club)
    const d = toCents(discount)
    if (r === null) return null
    const p = { regularPriceCents: r, clubPriceCents: c, discountPriceCents: d }
    return { effective: effectivePriceCents(p), anchor: hasAnchorPrice(p), regular: r }
  }, [regular, club, discount])

  async function patch(body: Record<string, unknown>) {
    const json = await jsonFetch<{ offer: OrgOffer }>(`/api/org/offers/${offer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    onChange(json.offer)
    return json.offer
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      await patch({
        title,
        description: description || null,
        regularPriceCents: toCents(regular),
        clubPriceCents: toCents(club),
        discountPriceCents: toCents(discount),
        shippingCents: incBall ? toCents(shipping) ?? 0 : 0,
        includesBreakdown: incBreakdown,
        includesBall: incBall,
        includesCourse: incCourse,
        unlockScope: scope,
        joinTeamId: incCourse && joinTeamId ? joinTeamId : null,
      })
      setMsg('Saved.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    setToggling(true)
    setMsg(null)
    try {
      await patch({ active: !offer.active })
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update')
    } finally {
      setToggling(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete "${offer.title}"? Past sales are kept.`)) return
    try {
      await jsonFetch(`/api/org/offers/${offer.id}`, { method: 'DELETE' })
      onDelete(offer.id)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not delete')
    }
  }

  return (
    <div className={`${CARD} p-5 space-y-4 ${offer.active ? '' : 'border-dashed'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black text-black dark:text-chalk truncate">{offer.title}</p>
          <p className="text-xs text-gray-500 dark:text-chalk-dim">
            {offer.active ? (
              <span className="font-semibold text-green-700 dark:text-green-400">On — families can buy this</span>
            ) : (
              <span>Off — review the pricing, then turn it on</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={offer.active}
            onClick={toggleActive}
            disabled={toggling || (!offer.active && !sellingEnabled)}
            title={!offer.active && !sellingEnabled ? 'Request selling access first' : undefined}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50 ${
              offer.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-ink-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                offer.active ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
            <span className="sr-only">{offer.active ? 'On' : 'Off'}</span>
          </button>
          <span className="text-xs font-bold text-gray-600 dark:text-chalk-dim w-6">{offer.active ? 'On' : 'Off'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={LABEL}>Name</label>
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Description (shown to families)</label>
          <textarea className={`${INPUT} min-h-[64px]`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </div>
        <div>
          <label className={LABEL}>Regular price ($)</label>
          <input className={INPUT} inputMode="decimal" value={regular} onChange={(e) => setRegular(e.target.value)} placeholder="49.99" />
          <p className="text-[11px] text-gray-400 mt-1">Shown crossed out when a lower price applies.</p>
        </div>
        <div>
          <label className={LABEL}>Club price ($)</label>
          <input className={INPUT} inputMode="decimal" value={club} onChange={(e) => setClub(e.target.value)} placeholder="29.99" />
          <p className="text-[11px] text-gray-400 mt-1">What your families actually pay.</p>
        </div>
        <div>
          <label className={LABEL}>Discount price ($, optional)</label>
          <input className={INPUT} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Leave blank for none" />
          <p className="text-[11px] text-gray-400 mt-1">A promo that beats the club price.</p>
        </div>
        {incBall && (
          <div>
            <label className={LABEL}>Shipping ($, flat)</label>
            <input className={INPUT} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0.00" />
            <p className="text-[11px] text-gray-400 mt-1">Charged on top, not split. $0 = priced in.</p>
          </div>
        )}
        <div className="sm:col-span-2">
          <p className={LABEL}>Includes</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {[
              ['Full breakdown', incBreakdown, setIncBreakdown],
              ['LearnHoops ball (shipped by LearnHoops)', incBall, setIncBall],
              ['Shooting Class registration', incCourse, setIncCourse],
            ].map(([label, val, set]) => (
              <label key={label as string} className="inline-flex items-center gap-2 text-gray-800 dark:text-chalk">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-ember-500"
                  checked={val as boolean}
                  onChange={(e) => (set as (v: boolean) => void)(e.target.checked)}
                />
                {label as string}
              </label>
            ))}
          </div>
        </div>
        {incBreakdown && (
          <div className="sm:col-span-2">
            <p className={LABEL}>After purchase, unlock</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-2 text-gray-800 dark:text-chalk">
                <input type="radio" className="accent-ember-500" checked={scope === 'submission'} onChange={() => setScope('submission')} />
                This report only
              </label>
              <label className="inline-flex items-center gap-2 text-gray-800 dark:text-chalk">
                <input type="radio" className="accent-ember-500" checked={scope === 'player'} onChange={() => setScope('player')} />
                All this player&apos;s reports (every week)
              </label>
            </div>
          </div>
        )}
        {incCourse && (
          <div className="sm:col-span-2">
            <label className={LABEL}>Team join link in the receipt (optional)</label>
            <select className={INPUT} value={joinTeamId} onChange={(e) => setJoinTeamId(e.target.value)}>
              <option value="">No join link</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Class buyers get a link to join this team&apos;s roster.</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-sm text-gray-700 dark:text-chalk">
          {preview ? (
            <>
              Families pay <span className="font-black text-black dark:text-chalk">{offerUsd(preview.effective)}</span>
              {preview.anchor && <span className="ml-1.5 text-gray-400 line-through">{offerUsd(preview.regular)}</span>}
              {incBall && toCents(shipping) ? <span className="text-gray-500"> + {offerUsd(toCents(shipping)!)} shipping</span> : null}
            </>
          ) : (
            <span className="text-red-600">Enter a regular price</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-gray-500 dark:text-chalk-dim">{msg}</span>}
          <button type="button" onClick={remove} className={backendButton('danger')} aria-label="Delete offer">
            <Trash2Icon aria-hidden />
          </button>
          <button type="button" onClick={save} disabled={saving} className={backendButton('primary')}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

type SalesFilter = 'all' | 'course' | 'ball' | 'breakdown'

function SalesSection({ sales, totals, loading }: { sales: SaleRow[]; totals: Totals[]; loading: boolean }) {
  const [filter, setFilter] = useState<SalesFilter>('all')
  const rows = sales.filter((s) =>
    filter === 'all' ? true : filter === 'course' ? s.includesCourse : filter === 'ball' ? s.includesBall : s.includesBreakdown && !s.includesBall && !s.includesCourse
  )
  const chips: Array<[SalesFilter, string]> = [
    ['all', 'All'],
    ['course', 'Class registrations'],
    ['ball', 'Ball orders'],
    ['breakdown', 'Breakdown unlocks'],
  ]
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="p-5 space-y-4">
        <div>
          <h2 className="text-lg font-black text-black dark:text-chalk">Sales &amp; earnings</h2>
          <p className="text-sm text-gray-500 dark:text-chalk-dim mt-1">
            Every purchase your families make. LearnHoops collects payment and pays out your share manually — contact
            support@learnhoops.com about payouts. Sales in different currencies are kept separate.
          </p>
        </div>
        {totals.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-chalk-dim">{loading ? 'Loading…' : 'No sales yet.'}</p>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {totals.map((t) => (
              <div key={t.currency} className="contents">
                {[
                  ['Gross', t.grossCents],
                  ['Your share', t.orgShareCents],
                  ['Paid out', t.paidOutCents],
                  ['Owed to you', t.owedCents],
                ].map(([label, cents]) => (
                  <div key={`${t.currency}-${label}`} className="rounded-xl border border-gray-200 dark:border-courtline p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-chalk-dim">
                      {label as string} <span className="text-gray-400">({t.currency.toUpperCase()})</span>
                    </p>
                    <p className={`text-lg font-black tabular-nums ${(cents as number) < 0 ? 'text-red-600' : 'text-black dark:text-chalk'}`}>
                      {money(cents as number, t.currency)}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                filter === id
                  ? 'bg-ember-500 text-ink-950 border-ember-500'
                  : 'border-gray-200 dark:border-courtline text-gray-600 dark:text-chalk-dim hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto border-t border-gray-200 dark:border-courtline">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-chalk-dim">
              <th className="px-4 py-2">Date</th>
              <th className="px-2 py-2">Buyer</th>
              <th className="px-2 py-2">Offer</th>
              <th className="px-2 py-2 text-right">Paid</th>
              <th className="px-2 py-2 text-right">Your share</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-courtline">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400 dark:text-chalk-dim">
                  {loading ? 'Loading…' : 'Nothing here yet.'}
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-ink-800/60">
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 dark:text-chalk-dim">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td className="px-2 py-2.5">
                  <span className="block font-medium text-gray-900 dark:text-chalk">{s.buyerName ?? s.buyerEmail}</span>
                  {s.buyerName && <span className="block text-[11px] text-gray-400">{s.buyerEmail}</span>}
                </td>
                <td className="px-2 py-2.5 text-gray-900 dark:text-chalk">
                  {s.offerTitle}
                  <span className="ml-2 inline-flex gap-1">
                    {s.includesCourse && <span className="text-[10px] font-bold uppercase rounded-full bg-ember-500/10 text-ember-600 dark:text-ember-400 px-1.5 py-0.5">class</span>}
                    {s.includesBall && <span className="text-[10px] font-bold uppercase rounded-full bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-chalk-dim px-1.5 py-0.5">ball{s.shipStatus ? ` · ${s.shipStatus}` : ''}</span>}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-gray-900 dark:text-chalk">
                  {money(s.amountCents, s.currency)}
                  {s.refundedCents > 0 && <span className="block text-[11px] text-red-600">−{money(s.refundedCents, s.currency)} refunded</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums font-bold text-gray-900 dark:text-chalk">{money(s.orgShareOwedCents, s.currency)}</td>
                <td className="px-4 py-2.5 text-gray-500 dark:text-chalk-dim capitalize">{s.refundedCents > 0 ? 'refunded' : s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

export default function OrgOffersPanel() {
  const inApp = useIsInApp()
  const [offers, setOffers] = useState<OrgOffer[]>([])
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [selling, setSelling] = useState<Selling>({ enabled: false, requested: false, platformSharePercent: null })
  const [settings, setSettings] = useState<Settings>({ freeTier: 'full', unlockTier: 'full' })
  const [sales, setSales] = useState<SaleRow[]>([])
  const [totals, setTotals] = useState<Totals[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchAll()
      .then((r) => {
        if (cancelled) return
        setOffers(r.offers)
        setSelling(r.selling)
        setTeams(r.teams)
        setOrgId(r.orgId)
        setSettings(r.settings)
        setSales(r.sales)
        setTotals(r.totals)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Could not load offers')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function addOffer() {
    setAdding(true)
    try {
      const json = await jsonFetch<{ offer: OrgOffer }>('/api/org/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'bundle',
          title: 'New offer',
          includesBreakdown: true,
          regularPriceCents: 9900,
          clubPriceCents: 7900,
          unlockScope: 'submission',
          sortOrder: offers.length + 1,
        }),
      })
      setOffers((prev) => [...prev, json.offer])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add an offer')
    } finally {
      setAdding(false)
    }
  }

  const unlockOfferActive = offers.some((o) => o.active && o.includesBreakdown)

  return (
    <div className="space-y-5">
      {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}

      <VisibilityCard
        key={`${settings.freeTier}-${settings.unlockTier}`}
        settings={settings}
        onSaved={setSettings}
        sellingEnabled={selling.enabled}
        unlockOfferActive={unlockOfferActive}
      />

      {inApp ? (
        <section className={`${CARD} p-5`}>
          <p className="text-sm text-gray-500 dark:text-chalk-dim">Offers, pricing and sales are managed on the LearnHoops website.</p>
        </section>
      ) : (
        <>
          <SellingCard selling={selling} orgId={orgId} onChange={setSelling} />

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-black dark:text-chalk">Your offers</h2>
                <p className="text-sm text-gray-500 dark:text-chalk-dim">
                  What families can buy from a player&apos;s results page. Draft prices are starting points — set your own,
                  then turn each offer on.
                </p>
              </div>
              <button type="button" onClick={addOffer} disabled={adding || loading} className={backendButton('secondary')}>
                <PlusIcon aria-hidden />
                {adding ? 'Adding…' : 'Add offer'}
              </button>
            </div>
            {loading && offers.length === 0 && <p className="text-sm text-gray-400 dark:text-chalk-dim">Loading…</p>}
            <div className="grid grid-cols-1 gap-4">
              {offers.map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  teams={teams}
                  sellingEnabled={selling.enabled}
                  onChange={(u) => setOffers((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
                  onDelete={(id) => setOffers((prev) => prev.filter((x) => x.id !== id))}
                />
              ))}
            </div>
          </section>

          <SalesSection sales={sales} totals={totals} loading={loading} />
        </>
      )}
    </div>
  )
}
