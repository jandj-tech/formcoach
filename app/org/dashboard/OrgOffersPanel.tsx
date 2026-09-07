'use client'

import { useEffect, useMemo, useState } from 'react'
import { backendButton } from '@/components/backend/button-styles'
import { useIsInApp } from '@/lib/useIsInApp'
import { copyToClipboard } from '@/lib/copy'
import { TIER_ORDER, TIER_LABELS, TIER_DESCRIPTIONS, tierRank, type VisibilityTier } from '@/lib/result-visibility'
import {
  applyShareRule,
  effectivePriceCents,
  hasAnchorPrice,
  offerUsd,
  shareRuleFor,
  shareRuleLabel,
  type OrgOffer,
} from '@/lib/org-offers'
import { CopyIcon, ExternalLinkIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'

// The Offers & Sales tab. One status bar, then three sections picked from a
// segmented control — Offers · What players see · Sales & earnings — so the
// page never shows more than one job at a time. Offers stay collapsed to a
// single summary row until Edit is pressed.
//
// Money is never hidden: every offer row shows "Families pay · LearnHoops
// keeps · You get", computed from the same rule the checkout freezes into the
// order. Selling is quote-gated: offers can be edited any time but only turned
// on once LearnHoops has switched selling on for the org.

const CARD = 'bg-white dark:bg-ink-900 border border-gray-200 dark:border-courtline rounded-2xl'
const INPUT =
  'w-full border border-gray-200 dark:border-courtline rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-chalk dark:bg-ink-900 placeholder:text-gray-400 focus:outline-none focus:border-ember-500'
const LABEL = 'block text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-chalk-dim mb-1'

type Section = 'offers' | 'visibility' | 'sales'

interface Selling {
  enabled: boolean
  requested: boolean
  platformSharePercent: number | null
}

interface Settings {
  freeTier: VisibilityTier
  unlockTier: VisibilityTier
}

interface OffersResponse {
  offers: OrgOffer[]
  selling: Selling
  teams: Array<{ id: string; name: string }>
  orgId: string
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
  platformShareCents: number
  refundedCents: number
  status: string
  shipStatus: string | null
}

interface Totals {
  currency: string
  grossCents: number
  orgShareCents: number
  platformShareCents: number
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

/** "Families pay $300 · LearnHoops keeps $100 · You get $200" for one offer. */
function splitPreview(
  pricing: { regularPriceCents: number; clubPriceCents: number | null; discountPriceCents: number | null },
  offer: { platformShareCents: number | null; platformSharePercent: number | null },
  orgPercent: number | null
) {
  const price = effectivePriceCents(pricing)
  const rule = shareRuleFor(offer, orgPercent)
  if (!rule) return { price, rule: null, orgShareCents: null, platformShareCents: null }
  const split = applyShareRule(price, rule)
  return { price, rule, ...split }
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function StatusBar({
  selling,
  orgId,
  onChange,
}: {
  selling: Selling
  orgId: string | null
  onChange: (s: Selling) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
    const pct = selling.platformSharePercent ?? 0
    const url = orgId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/offers/${orgId}` : ''
    return (
      <section className={`${CARD} px-5 py-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-black text-black dark:text-chalk">Selling on</p>
            <p className="text-xs text-gray-500 dark:text-chalk-dim">
              Families pay LearnHoops by card. LearnHoops keeps {pct}% of each sale (Shooting Class sign-ups: a fixed
              amount, shown on the offer) and pays the rest to you.
            </p>
          </div>
        </div>
        {orgId && (
          <div className="flex items-center gap-2">
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
              {copied ? 'Copied!' : 'Copy your shop link'}
            </button>
            <a href={`/offers/${orgId}`} target="_blank" rel="noopener noreferrer" className={backendButton('quiet')}>
              <ExternalLinkIcon aria-hidden />
              Open
            </a>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="bg-gradient-to-br from-ember-500 to-ember-600 text-white rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <p className="text-sm font-black">{selling.requested ? 'Request received' : 'Not selling yet'}</p>
        <p className="text-xs text-white/90 leading-relaxed mt-0.5">
          {selling.requested
            ? 'LearnHoops will email you to confirm your share and switch selling on — usually within a day. You can set up your offers now.'
            : 'Sell the full breakdown, the LearnHoops ball and your Shooting Class from every player’s results page. LearnHoops takes the payment and pays you your share.'}
        </p>
        {err && <p className="text-xs font-bold mt-1">{err}</p>}
      </div>
      {!selling.requested && (
        <button
          type="button"
          onClick={request}
          disabled={busy}
          className="inline-flex items-center rounded-xl bg-white text-ember-600 font-bold px-4 py-2 text-sm hover:bg-white/90 disabled:opacity-60 shrink-0"
        >
          {busy ? 'Sending…' : 'Request selling access'}
        </button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

function SectionPicker({
  value,
  onChange,
  counts,
}: {
  value: Section
  onChange: (s: Section) => void
  counts: { on: number; sales: number }
}) {
  const items: Array<{ id: Section; label: string; hint: string; badge?: number }> = [
    { id: 'offers', label: 'Offers', hint: 'What families can buy', badge: counts.on },
    { id: 'visibility', label: 'What players see', hint: 'Free vs. after buying' },
    { id: 'sales', label: 'Sales & earnings', hint: 'Who paid, what you get', badge: counts.sales },
  ]
  return (
    <div role="tablist" aria-label="Offers & Sales sections" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {items.map((it) => {
        const active = value === it.id
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={`text-left rounded-2xl border px-4 py-3 transition-colors ${
              active
                ? 'border-ember-500 bg-ember-50 dark:bg-ember-500/10'
                : 'border-gray-200 dark:border-courtline bg-white dark:bg-ink-900 hover:border-gray-300 dark:hover:border-chalk-dim/40'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`text-sm font-black ${active ? 'text-ember-700 dark:text-ember-400' : 'text-black dark:text-chalk'}`}>
                {it.label}
              </span>
              {typeof it.badge === 'number' && it.badge > 0 && (
                <span className="rounded-full bg-gray-100 dark:bg-ink-800 px-2 py-0.5 text-[11px] font-bold text-gray-600 dark:text-chalk-dim">
                  {it.badge}
                </span>
              )}
            </span>
            <span className="block text-xs text-gray-500 dark:text-chalk-dim mt-0.5">{it.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// What players see
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
      <legend className="text-sm font-black text-black dark:text-chalk">{title}</legend>
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

function VisibilitySection({
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
  // Remounted by the parent (keyed on the saved settings), so no syncing effect.
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
          Right now players get <span className="font-semibold text-gray-700 dark:text-chalk">{TIER_LABELS[settings.freeTier]}</span>{' '}
          for free
          {tierRank(settings.freeTier) < tierRank(settings.unlockTier) ? (
            <>
              , and buying unlocks <span className="font-semibold text-gray-700 dark:text-chalk">{TIER_LABELS[settings.unlockTier]}</span>.
            </>
          ) : (
            <> — there is no paywall.</>
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <TierRadioGroup
          title="1. Free with the email"
          hint="What the link shows before anyone pays."
          value={free}
          onChange={(t) => {
            setFree(t)
            if (tierRank(t) > tierRank(unlock)) setUnlock(t)
          }}
        />
        <TierRadioGroup
          title="2. After they buy"
          hint="What a purchase unlocks. At least as much as the free level."
          value={unlock}
          onChange={setUnlock}
          disabledBelow={free}
        />
      </div>
      {paywalled && !(sellingEnabled && unlockOfferActive) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          This hides part of the report, but nothing is for sale yet — players would have no way to unlock the rest.{' '}
          {sellingEnabled ? 'Turn on an offer that includes the full breakdown in Offers.' : 'Request selling access in the bar above first.'}
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
// Offers
// ---------------------------------------------------------------------------

function OfferRow({
  offer,
  teams,
  orgPercent,
  sellingEnabled,
  editing,
  onEdit,
  onChange,
  onDelete,
}: {
  offer: OrgOffer
  teams: Array<{ id: string; name: string }>
  orgPercent: number | null
  sellingEnabled: boolean
  editing: boolean
  onEdit: (open: boolean) => void
  onChange: (o: OrgOffer) => void
  onDelete: (id: string) => void
}) {
  const [toggling, setToggling] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const summary = splitPreview(offer, offer, orgPercent)

  async function patch(body: Record<string, unknown>) {
    const json = await jsonFetch<{ offer: OrgOffer }>(`/api/org/offers/${offer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    onChange(json.offer)
    return json.offer
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

  const includes = [
    offer.includesBreakdown ? 'Full breakdown' : null,
    offer.includesBall ? 'LearnHoops ball' : null,
    offer.includesCourse ? 'Shooting Class' : null,
  ].filter(Boolean) as string[]

  return (
    <div className={`${CARD} ${offer.active ? '' : 'border-dashed'}`}>
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button
          type="button"
          role="switch"
          aria-checked={offer.active}
          aria-label={`${offer.title} ${offer.active ? 'on' : 'off'}`}
          onClick={toggleActive}
          disabled={toggling || (!offer.active && !sellingEnabled)}
          title={!offer.active && !sellingEnabled ? 'Request selling access first' : offer.active ? 'Turn off' : 'Turn on'}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            offer.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-ink-700'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
              offer.active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <div className="flex-1 min-w-[12rem]">
          <p className="text-base font-black text-black dark:text-chalk leading-tight">
            {offer.title}
            <span
              className={`ml-2 align-middle text-[11px] font-bold rounded-full px-2 py-0.5 ${
                offer.active
                  ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-ink-800 text-gray-500 dark:text-chalk-dim'
              }`}
            >
              {offer.active ? 'On' : 'Off'}
            </span>
          </p>
          <p className="text-xs text-gray-500 dark:text-chalk-dim mt-0.5">{includes.join(' + ')}</p>
        </div>
        <div className="text-right tabular-nums">
          <p className="text-sm text-gray-700 dark:text-chalk">
            Families pay <span className="font-black text-black dark:text-chalk">{offerUsd(summary.price)}</span>
            {hasAnchorPrice(offer) && <span className="ml-1.5 text-gray-400 line-through text-xs">{offerUsd(offer.regularPriceCents)}</span>}
          </p>
          {summary.rule ? (
            <p className="text-xs text-gray-500 dark:text-chalk-dim">
              LearnHoops keeps <span className="font-semibold">{offerUsd(summary.platformShareCents!)}</span> · You get{' '}
              <span className="font-black text-green-700 dark:text-green-400">{offerUsd(summary.orgShareCents!)}</span>
            </p>
          ) : (
            <p className="text-xs text-gray-400">Your share appears once selling is on</p>
          )}
        </div>
        <button type="button" onClick={() => onEdit(!editing)} className={backendButton(editing ? 'quiet' : 'secondary')}>
          <PencilIcon aria-hidden />
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>
      {msg && <p className="px-5 pb-3 text-xs font-semibold text-red-600 dark:text-red-400">{msg}</p>}

      {editing && (
        <OfferEditor
          offer={offer}
          teams={teams}
          orgPercent={orgPercent}
          onSaved={(o) => {
            onChange(o)
            onEdit(false)
          }}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}

function OfferEditor({
  offer,
  teams,
  orgPercent,
  onSaved,
  onDelete,
}: {
  offer: OrgOffer
  teams: Array<{ id: string; name: string }>
  orgPercent: number | null
  onSaved: (o: OrgOffer) => void
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
  const [msg, setMsg] = useState<string | null>(null)

  const preview = useMemo(() => {
    const r = toCents(regular)
    if (r === null) return null
    return splitPreview(
      { regularPriceCents: r, clubPriceCents: toCents(club), discountPriceCents: toCents(discount) },
      offer,
      orgPercent
    )
  }, [regular, club, discount, offer, orgPercent])

  async function save() {
    setSaving(true)
    setMsg(null)
    try {
      const json = await jsonFetch<{ offer: OrgOffer }>(`/api/org/offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      })
      onSaved(json.offer)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
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

  const rule = shareRuleFor(offer, orgPercent)

  return (
    <div className="border-t border-gray-200 dark:border-courtline px-5 py-5 space-y-5">
      {/* 1. What it is */}
      <div className="space-y-3">
        <p className="text-sm font-black text-black dark:text-chalk">1. What families get</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={LABEL}>Name</label>
            <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Description (shown to families)</label>
            <textarea className={`${INPUT} min-h-[64px]`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-3 text-sm">
            {(
              [
                ['Full breakdown of their shot', incBreakdown, setIncBreakdown],
                ['LearnHoops ball (LearnHoops ships it)', incBall, setIncBall],
                ['Shooting Class sign-up', incCourse, setIncCourse],
              ] as Array<[string, boolean, (v: boolean) => void]>
            ).map(([label, val, set]) => (
              <label key={label} className="inline-flex items-center gap-2 text-gray-800 dark:text-chalk">
                <input type="checkbox" className="w-4 h-4 accent-ember-500" checked={val} onChange={(e) => set(e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Price */}
      <div className="space-y-3">
        <p className="text-sm font-black text-black dark:text-chalk">2. Price</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Club price ($)</label>
            <input className={INPUT} inputMode="decimal" value={club} onChange={(e) => setClub(e.target.value)} placeholder="29.99" />
            <p className="text-[11px] text-gray-400 mt-1">What your families pay.</p>
          </div>
          <div>
            <label className={LABEL}>Regular price ($)</label>
            <input className={INPUT} inputMode="decimal" value={regular} onChange={(e) => setRegular(e.target.value)} placeholder="49.99" />
            <p className="text-[11px] text-gray-400 mt-1">Shown crossed out.</p>
          </div>
          <div>
            <label className={LABEL}>Discount price ($, optional)</label>
            <input className={INPUT} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Leave blank" />
            <p className="text-[11px] text-gray-400 mt-1">A short promo that beats club.</p>
          </div>
          {incBall && (
            <div>
              <label className={LABEL}>Shipping ($, flat)</label>
              <input className={INPUT} inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0.00" />
              <p className="text-[11px] text-gray-400 mt-1">Added at checkout. Not split. $0 = priced in.</p>
            </div>
          )}
        </div>
        <div className="rounded-xl bg-gray-50 dark:bg-ink-800 border border-gray-200 dark:border-courtline px-4 py-3 text-sm">
          {preview ? (
            preview.rule ? (
              <p className="text-gray-700 dark:text-chalk tabular-nums">
                Families pay <span className="font-black text-black dark:text-chalk">{offerUsd(preview.price)}</span>
                {' · '}LearnHoops keeps <span className="font-semibold">{offerUsd(preview.platformShareCents!)}</span>
                <span className="text-gray-400"> ({shareRuleLabel(preview.rule)})</span>
                {' · '}You get <span className="font-black text-green-700 dark:text-green-400">{offerUsd(preview.orgShareCents!)}</span>
                {preview.orgShareCents === 0 && (
                  <span className="block text-xs text-amber-700 dark:text-amber-400 mt-1">
                    At this price LearnHoops&apos; fixed fee takes the whole sale — raise the club price to earn from it.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-gray-500 dark:text-chalk-dim">
                Families pay <span className="font-black text-black dark:text-chalk">{offerUsd(preview.price)}</span>. Your share appears once selling is on.
              </p>
            )
          ) : (
            <p className="text-red-600">Enter a regular price.</p>
          )}
          {rule?.mode === 'flat' && (
            <p className="text-[11px] text-gray-400 mt-1">LearnHoops&apos; fee on this offer is a fixed amount set by LearnHoops.</p>
          )}
        </div>
      </div>

      {/* 3. After purchase */}
      {(incBreakdown || incCourse) && (
        <div className="space-y-3">
          <p className="text-sm font-black text-black dark:text-chalk">3. After they buy</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {incBreakdown && (
              <div>
                <p className={LABEL}>Unlock the full breakdown on</p>
                <div className="flex flex-col gap-1.5 text-sm">
                  <label className="inline-flex items-center gap-2 text-gray-800 dark:text-chalk">
                    <input type="radio" className="accent-ember-500" checked={scope === 'submission'} onChange={() => setScope('submission')} />
                    This report only
                  </label>
                  <label className="inline-flex items-center gap-2 text-gray-800 dark:text-chalk">
                    <input type="radio" className="accent-ember-500" checked={scope === 'player'} onChange={() => setScope('player')} />
                    Every report this player gets (all season)
                  </label>
                </div>
              </div>
            )}
            {incCourse && (
              <div>
                <label className={LABEL}>Add a team join link to the receipt</label>
                <select className={INPUT} value={joinTeamId} onChange={(e) => setJoinTeamId(e.target.value)}>
                  <option value="">No join link</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">So the class player lands on the right roster.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button type="button" onClick={remove} className={backendButton('danger')}>
          <Trash2Icon aria-hidden />
          Delete offer
        </button>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-red-600 dark:text-red-400">{msg}</span>}
          <button type="button" onClick={save} disabled={saving} className={backendButton('primary')}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OffersSection({
  offers,
  teams,
  selling,
  onOffersChange,
}: {
  offers: OrgOffer[]
  teams: Array<{ id: string; name: string }>
  selling: Selling
  onOffersChange: (fn: (prev: OrgOffer[]) => OrgOffer[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function addOffer() {
    setAdding(true)
    setErr(null)
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
      onOffersChange((prev) => [...prev, json.offer])
      setEditingId(json.offer.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add an offer')
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-black dark:text-chalk">Offers</h2>
          <p className="text-sm text-gray-500 dark:text-chalk-dim">
            Flip an offer <span className="font-semibold">On</span> to sell it. Tap <span className="font-semibold">Edit</span> to change the name or price.
          </p>
        </div>
        <button type="button" onClick={addOffer} disabled={adding} className={backendButton('secondary')}>
          <PlusIcon aria-hidden />
          {adding ? 'Adding…' : 'Add offer'}
        </button>
      </div>
      {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}
      {offers.length === 0 && <p className="text-sm text-gray-400 dark:text-chalk-dim">Loading…</p>}
      <div className="space-y-3">
        {offers.map((o) => (
          <OfferRow
            key={o.id}
            offer={o}
            teams={teams}
            orgPercent={selling.platformSharePercent}
            sellingEnabled={selling.enabled}
            editing={editingId === o.id}
            onEdit={(open) => setEditingId(open ? o.id : null)}
            onChange={(u) => onOffersChange((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
            onDelete={(id) => {
              onOffersChange((prev) => prev.filter((x) => x.id !== id))
              setEditingId(null)
            }}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Sales & earnings
// ---------------------------------------------------------------------------

type SalesFilter = 'all' | 'course' | 'ball' | 'breakdown'

function SalesSection({ sales, totals, loading }: { sales: SaleRow[]; totals: Totals[]; loading: boolean }) {
  const [filter, setFilter] = useState<SalesFilter>('all')
  const rows = sales.filter((s) =>
    filter === 'all'
      ? true
      : filter === 'course'
        ? s.includesCourse
        : filter === 'ball'
          ? s.includesBall
          : s.includesBreakdown && !s.includesBall && !s.includesCourse
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
            Every purchase your families make. LearnHoops takes the payment, keeps its share, and pays you the rest —
            <span className="font-semibold text-gray-700 dark:text-chalk"> Still owed</span> is what hasn&apos;t been paid to you yet. Questions: support@learnhoops.com.
          </p>
        </div>
        {totals.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-chalk-dim">{loading ? 'Loading…' : 'No sales yet.'}</p>
        ) : (
          totals.map((t) => (
            <div key={t.currency} className="space-y-2">
              {totals.length > 1 && (
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-chalk-dim">{t.currency.toUpperCase()} sales</p>
              )}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
                {(
                  [
                    ['Sales', t.grossCents, false],
                    ['You get', t.orgShareCents, false],
                    ['LearnHoops keeps', t.platformShareCents, false],
                    ['Paid to you', t.paidOutCents, false],
                    ['Still owed', t.owedCents, true],
                  ] as Array<[string, number, boolean]>
                ).map(([label, cents, highlight]) => (
                  <div
                    key={label}
                    className={`rounded-xl border p-3 ${
                      highlight ? 'border-ember-500/40 bg-ember-50 dark:bg-ember-500/10' : 'border-gray-200 dark:border-courtline'
                    }`}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-chalk-dim">
                      {label} <span className="text-gray-400">({t.currency.toUpperCase()})</span>
                    </p>
                    <p className={`text-lg font-black tabular-nums ${cents < 0 ? 'text-red-600' : 'text-black dark:text-chalk'}`}>
                      {money(cents, t.currency)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))
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
              <th className="px-2 py-2 text-right">LearnHoops</th>
              <th className="px-2 py-2 text-right">You get</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-courtline">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 dark:text-chalk-dim">
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
                    {s.includesBall && (
                      <span className="text-[10px] font-bold uppercase rounded-full bg-gray-100 dark:bg-ink-800 text-gray-600 dark:text-chalk-dim px-1.5 py-0.5">
                        ball{s.shipStatus ? ` · ${s.shipStatus}` : ''}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-gray-900 dark:text-chalk">
                  {money(s.amountCents, s.currency)}
                  {s.refundedCents > 0 && <span className="block text-[11px] text-red-600">−{money(s.refundedCents, s.currency)} refunded</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-gray-500 dark:text-chalk-dim">
                  {money(Math.max(0, s.amountCents - s.refundedCents) - s.orgShareOwedCents, s.currency)}
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
  const [section, setSection] = useState<Section>('offers')
  const [offers, setOffers] = useState<OrgOffer[]>([])
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([])
  const [orgId, setOrgId] = useState<string | null>(null)
  const [selling, setSelling] = useState<Selling>({ enabled: false, requested: false, platformSharePercent: null })
  const [settings, setSettings] = useState<Settings>({ freeTier: 'full', unlockTier: 'full' })
  const [sales, setSales] = useState<SaleRow[]>([])
  const [totals, setTotals] = useState<Totals[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

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

  const unlockOfferActive = offers.some((o) => o.active && o.includesBreakdown)

  if (inApp) {
    // Prices and checkout stay off the app (App Store 3.1.1); visibility is fine.
    return (
      <div className="space-y-5">
        <VisibilitySection
          key={`${settings.freeTier}-${settings.unlockTier}`}
          settings={settings}
          onSaved={setSettings}
          sellingEnabled={selling.enabled}
          unlockOfferActive={unlockOfferActive}
        />
        <section className={`${CARD} p-5`}>
          <p className="text-sm text-gray-500 dark:text-chalk-dim">Offers, pricing and sales are managed on the LearnHoops website.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {err && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{err}</p>}

      <StatusBar selling={selling} orgId={orgId} onChange={setSelling} />

      <SectionPicker
        value={section}
        onChange={setSection}
        counts={{ on: offers.filter((o) => o.active).length, sales: sales.length }}
      />

      {section === 'offers' && <OffersSection offers={offers} teams={teams} selling={selling} onOffersChange={(fn) => setOffers(fn)} />}

      {section === 'visibility' && (
        <VisibilitySection
          key={`${settings.freeTier}-${settings.unlockTier}`}
          settings={settings}
          onSaved={setSettings}
          sellingEnabled={selling.enabled}
          unlockOfferActive={unlockOfferActive}
        />
      )}

      {section === 'sales' && <SalesSection sales={sales} totals={totals} loading={loading} />}
    </div>
  )
}
