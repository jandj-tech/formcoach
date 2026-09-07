'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { OfferKind, OrgOffer } from '@/lib/org-offers'
import { TIER_LABELS, isVisibilityTier } from '@/lib/result-visibility'

// Response shapes from /api/admin/org-revenue. They mirror lib/org-sales.ts,
// which imports the DB and so cannot be pulled into a client component.
interface CurrencyTotals {
  currency: string
  grossCents: number
  refundedCents: number
  orgShareCents: number
  platformShareCents: number
  paidOutCents: number
  owedCents: number
  saleCount: number
}

interface OverviewOrg {
  orgId: string
  orgName: string
  adminEmail: string
  platformSharePercent: number | null
  offersRequestedAt: string | null
  activeOffers: number
  totals: CurrencyTotals[]
}

interface OrgSaleRow {
  id: string
  createdAt: string
  buyerEmail: string
  buyerName: string | null
  offerId: string | null
  offerTitle: string
  kind: string | null
  includesCourse: boolean
  includesBall: boolean
  includesBreakdown: boolean
  amountCents: number
  currency: string
  orgShareCents: number
  platformShareCents: number
  refundedCents: number
  orgShareOwedCents: number
  status: string
  shipStatus: string | null
}

interface OrgPayoutRow {
  id: string
  amountCents: number
  currency: string
  method: string | null
  note: string | null
  createdAt: string
}

interface OrgDetailsData {
  sales: OrgSaleRow[]
  payouts: OrgPayoutRow[]
  totals: CurrencyTotals[]
  offers: OrgOffer[]
  selling: { platformSharePercent: number | null; offersRequestedAt: string | null; enabled: boolean }
  settings: { freeTier: string; unlockTier: string }
}

type Currency = 'usd' | 'cad'

// ---------------------------------------------------------------------------
// Formatting + fetch helpers
// ---------------------------------------------------------------------------

const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString()
const fmtPercent = (n: number) => `${Number(n.toFixed(2))}%`

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function errorOf(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === 'string' ? data.error : fallback
}

type MutationResult = { ok: true; data: unknown } | { ok: false; error: string }

async function send(url: string, method: 'PATCH' | 'POST' | 'DELETE', body?: unknown): Promise<MutationResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await readJson(res)
    if (!res.ok) return { ok: false, error: errorOf(data, 'Request failed') }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Network error. Please try again.' }
  }
}

/** Overview of every selling org. Throws with the server's message on failure. */
async function fetchOverview(): Promise<OverviewOrg[]> {
  const res = await fetch('/api/admin/org-revenue', { cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok || !isRecord(data) || !Array.isArray(data.orgs)) {
    throw new Error(errorOf(data, 'Could not load org revenue'))
  }
  return data.orgs as OverviewOrg[]
}

/** One org's sales, payouts, offers and selling state. */
async function fetchDetails(orgId: string): Promise<OrgDetailsData> {
  const res = await fetch(`/api/admin/org-revenue?orgId=${encodeURIComponent(orgId)}`, { cache: 'no-store' })
  const data = await readJson(res)
  if (!res.ok || !isRecord(data) || !Array.isArray(data.sales) || !Array.isArray(data.offers)) {
    throw new Error(errorOf(data, 'Could not load this organization'))
  }
  return data as unknown as OrgDetailsData
}

const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/** "12.5" -> 12.5 when it is a finite 0-100 percent, else null. */
function parsePercentInput(raw: string): number | null {
  const s = raw.trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

/** "29.99" -> 2999. Blank -> null. Not a number -> undefined. */
function dollarsToCents(raw: string): number | null | undefined {
  const s = raw.trim()
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n)) return undefined
  return Math.round(n * 100)
}

const centsToDollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2))

const isCurrency = (v: string): v is Currency => v === 'usd' || v === 'cad'

/** The currency an admin most likely wants to pay out next: the one owed the most. */
function largestOwedCurrency(totals: CurrencyTotals[]): Currency {
  let best: Currency = 'usd'
  let bestOwed = Number.NEGATIVE_INFINITY
  for (const t of totals) {
    const c = t.currency.toLowerCase()
    if (isCurrency(c) && t.owedCents > bestOwed) {
      best = c
      bestOwed = t.owedCents
    }
  }
  return best
}

const KIND_LABELS: Record<OfferKind, string> = {
  breakdown: 'Breakdown',
  ball: 'Ball',
  course: 'Class',
  bundle: 'Bundle',
}

// ---------------------------------------------------------------------------
// Shared class strings (match the other admin pages)
// ---------------------------------------------------------------------------

const CARD = 'bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800'
const INPUT =
  'bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-black dark:text-white text-sm placeholder:text-gray-500 dark:placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 disabled:opacity-50'
const BTN_PRIMARY =
  'bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap'
const BTN_SECONDARY =
  'bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-black dark:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap'
const BTN_QUIET =
  'text-gray-600 dark:text-zinc-400 hover:text-black dark:hover:text-white text-xs transition-colors disabled:opacity-50 whitespace-nowrap'
const BTN_DANGER_QUIET = 'text-gray-600 dark:text-zinc-400 hover:text-red-500 text-xs transition-colors disabled:opacity-50 whitespace-nowrap'
const TH = 'text-left px-3 py-2.5 font-medium whitespace-nowrap'
const TD = 'px-3 py-2.5 align-top'
const THEAD = 'border-b border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 text-xs'
const TBODY = 'divide-y divide-gray-200/70 dark:divide-zinc-800/50'
const MUTED = 'text-gray-500 dark:text-zinc-500'
const ERROR_TEXT = 'text-xs text-red-500'

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function CurrencyTag({ currency }: { currency: string }) {
  return (
    <span className="inline-block text-[10px] font-mono font-semibold tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 uppercase">
      {currency}
    </span>
  )
}

function Money({ cents, currency, negativeRed = true }: { cents: number; currency: string; negativeRed?: boolean }) {
  const negative = negativeRed && cents < 0
  return <span className={negative ? 'text-red-500' : undefined}>{fmtMoney(cents, currency)}</span>
}

function Chip({ children, tone }: { children: React.ReactNode; tone: 'orange' | 'purple' | 'sky' | 'green' | 'red' | 'yellow' | 'gray' }) {
  const tones: Record<typeof tone, string> = {
    orange: 'bg-orange-500/10 text-orange-500',
    purple: 'bg-purple-500/10 text-purple-500 dark:text-purple-300',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
    green: 'bg-green-500/10 text-green-600 dark:text-green-400',
    red: 'bg-red-500/10 text-red-500',
    yellow: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    gray: 'bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-400',
  }
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>
}

function IncludesChips({ course, ball, breakdown }: { course: boolean; ball: boolean; breakdown: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {course && <Chip tone="purple">course</Chip>}
      {ball && <Chip tone="orange">ball</Chip>}
      {breakdown && <Chip tone="sky">breakdown</Chip>}
    </span>
  )
}

function Stat({ label, value, emphasis = false, negative = false }: { label: string; value: string; emphasis?: boolean; negative?: boolean }) {
  return (
    <div>
      <div className={`text-[11px] uppercase tracking-wide ${MUTED}`}>{label}</div>
      <div
        className={`text-sm ${emphasis ? 'font-black' : 'font-semibold'} ${
          negative ? 'text-red-500' : emphasis ? 'text-orange-500' : 'text-black dark:text-white'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <h2 className="text-lg font-black text-black dark:text-white">{children}</h2>
      {hint && <span className={`text-xs ${MUTED}`}>{hint}</span>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function OrgRevenueClient() {
  const [orgs, setOrgs] = useState<OverviewOrg[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Bumped whenever an overview-level mutation (split change) should make an
  // open details panel refetch too.
  const [detailsRefresh, setDetailsRefresh] = useState(0)

  // State is only touched inside the promise callbacks — the same shape the
  // other fetch-on-mount components use, which keeps the effect body free of
  // synchronous setState calls.
  const loadOverview = useCallback(
    () =>
      fetchOverview().then(
        (rows) => {
          setOrgs(rows)
          setError(null)
        },
        (err: unknown) => setError(messageOf(err, 'Could not load org revenue')),
      ),
    [],
  )

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  // Split changes alter selling state and offer activity, so the open panel
  // has to reload as well as the table.
  const afterSplitChange = useCallback(async () => {
    await loadOverview()
    setDetailsRefresh((v) => v + 1)
  }, [loadOverview])

  if (error && orgs === null) {
    return (
      <div className={`${CARD} p-6 space-y-3`}>
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={() => void loadOverview()} className={BTN_SECONDARY}>
          Retry
        </button>
      </div>
    )
  }

  if (orgs === null) {
    return <p className={`text-sm ${MUTED}`}>Loading org revenue...</p>
  }

  const quoteRequests = orgs.filter((o) => o.offersRequestedAt !== null && o.platformSharePercent === null)
  const selectedOrg = selectedId ? orgs.find((o) => o.orgId === selectedId) ?? null : null

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Quote requests -------------------------------------------------- */}
      <section className="space-y-3">
        <SectionTitle hint="Organizations waiting for a LearnHoops share before they can sell">Quote requests</SectionTitle>
        {quoteRequests.length === 0 ? (
          <p className={`text-sm ${MUTED}`}>No open quote requests.</p>
        ) : (
          <div className={`${CARD} divide-y divide-gray-200/70 dark:divide-zinc-800/50`}>
            {quoteRequests.map((org) => (
              <QuoteRequestRow key={org.orgId} org={org} onSaved={afterSplitChange} />
            ))}
          </div>
        )}
      </section>

      {/* Selling organizations ------------------------------------------- */}
      <section className="space-y-3">
        <SectionTitle hint="Every organization — set a share to enable selling, or clear it to switch selling off">Selling organizations</SectionTitle>
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={THEAD}>
                <th className={TH}>Org</th>
                <th className={TH}>Admin email</th>
                <th className={TH}>LearnHoops share</th>
                <th className={TH}>Active offers</th>
                <th className={TH}>Owed</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className={TBODY}>
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-3 py-6 ${MUTED}`}>
                    No organizations have requested selling access or made a sale yet.
                  </td>
                </tr>
              ) : (
                orgs.map((org) => (
                  <SellingOrgRow
                    // Remount when the saved split changes so the inline draft resets.
                    key={`${org.orgId}:${org.platformSharePercent ?? 'null'}`}
                    org={org}
                    selected={org.orgId === selectedId}
                    onSelect={() => setSelectedId(org.orgId === selectedId ? null : org.orgId)}
                    onChanged={afterSplitChange}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Details --------------------------------------------------------- */}
      {selectedOrg && (
        <OrgDetails
          key={selectedOrg.orgId}
          orgId={selectedOrg.orgId}
          orgName={selectedOrg.orgName}
          refreshKey={detailsRefresh}
          onOverviewChanged={loadOverview}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quote request row
// ---------------------------------------------------------------------------

function QuoteRequestRow({ org, onSaved }: { org: OverviewOrg; onSaved: () => Promise<void> }) {
  const [pct, setPct] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const parsed = parsePercentInput(pct)

  async function save() {
    if (parsed === null) return
    setSaving(true)
    setErr(null)
    const r = await send('/api/admin/org-split', 'PATCH', { orgId: org.orgId, platformSharePercent: parsed })
    if (!r.ok) {
      setErr(r.error)
      setSaving(false)
      return
    }
    await onSaved()
    setSaving(false)
  }

  return (
    <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
      <div className="min-w-[12rem] flex-1">
        <div className="font-medium text-black dark:text-white">{org.orgName}</div>
        <div className="text-xs text-gray-600 dark:text-zinc-400">{org.adminEmail}</div>
        {org.offersRequestedAt && <div className={`text-xs ${MUTED}`}>Requested {fmtDate(org.offersRequestedAt)}</div>}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600 dark:text-zinc-400 whitespace-nowrap">LearnHoops share</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="e.g. 20"
            disabled={saving}
            className={`${INPUT} w-24`}
          />
          <span className="text-sm text-gray-600 dark:text-zinc-400">%</span>
        </div>
        <button onClick={() => void save()} disabled={saving || parsed === null} className={BTN_PRIMARY}>
          {saving ? 'Saving...' : 'Set split & enable'}
        </button>
      </div>
      {err && <p className={`${ERROR_TEXT} w-full`}>{err}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Selling org row
// ---------------------------------------------------------------------------

function SellingOrgRow({
  org,
  selected,
  onSelect,
  onChanged,
}: {
  org: OverviewOrg
  selected: boolean
  onSelect: () => void
  onChanged: () => Promise<void>
}) {
  const [pct, setPct] = useState(org.platformSharePercent === null ? '' : String(org.platformSharePercent))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const parsed = parsePercentInput(pct)
  const dirty = parsed !== null && parsed !== org.platformSharePercent

  async function patchSplit(value: number | null) {
    setSaving(true)
    setErr(null)
    const r = await send('/api/admin/org-split', 'PATCH', { orgId: org.orgId, platformSharePercent: value })
    if (!r.ok) {
      setErr(r.error)
      setSaving(false)
      return
    }
    await onChanged()
    setSaving(false)
  }

  function disableSelling() {
    const n = org.activeOffers
    const offersNote = n > 0 ? ` and turn off ${n} active offer${n === 1 ? '' : 's'}` : ''
    if (!confirm(`Disable selling for ${org.orgName}? This clears the LearnHoops share${offersNote}.`)) return
    void patchSplit(null)
  }

  return (
    <tr className={`transition-colors ${selected ? 'bg-orange-500/5' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/30'}`}>
      <td className={`${TD} text-black dark:text-white`}>
        <div className="font-medium">{org.orgName}</div>
        {org.platformSharePercent === null && org.offersRequestedAt && (
          <div className={`text-xs ${MUTED}`}>Quote requested {fmtDate(org.offersRequestedAt)}</div>
        )}
      </td>
      <td className={`${TD} text-xs text-gray-600 dark:text-zinc-400`}>{org.adminEmail}</td>
      <td className={TD}>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="unset"
            disabled={saving}
            className={`${INPUT} w-20`}
          />
          <span className="text-xs text-gray-600 dark:text-zinc-400">%</span>
          <button
            onClick={() => {
              if (parsed !== null) void patchSplit(parsed)
            }}
            disabled={saving || !dirty}
            className={BTN_SECONDARY}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {org.platformSharePercent !== null && (
            <button onClick={disableSelling} disabled={saving} className={BTN_DANGER_QUIET}>
              Disable selling
            </button>
          )}
        </div>
        {org.platformSharePercent === null && <div className={`text-xs ${MUTED} mt-1`}>Selling disabled</div>}
        {err && <p className={`${ERROR_TEXT} mt-1`}>{err}</p>}
      </td>
      <td className={`${TD} text-black dark:text-white`}>{org.activeOffers}</td>
      <td className={TD}>
        {org.totals.length === 0 ? (
          <span className={MUTED}>—</span>
        ) : (
          <div className="space-y-0.5">
            {org.totals.map((t) => (
              <div key={t.currency} className="flex items-center gap-1.5 whitespace-nowrap">
                <CurrencyTag currency={t.currency} />
                <span className={`font-semibold ${t.owedCents < 0 ? 'text-red-500' : 'text-black dark:text-white'}`}>
                  {fmtMoney(t.owedCents, t.currency)}
                </span>
                <span className={`text-xs ${MUTED}`}>owed</span>
              </div>
            ))}
          </div>
        )}
      </td>
      <td className={`${TD} text-right`}>
        <button onClick={onSelect} className={selected ? BTN_PRIMARY : BTN_SECONDARY}>
          {selected ? 'Hide' : 'Details'}
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Details panel
// ---------------------------------------------------------------------------

function OrgDetails({
  orgId,
  orgName,
  refreshKey,
  onOverviewChanged,
  onClose,
}: {
  orgId: string
  orgName: string
  refreshKey: number
  onOverviewChanged: () => Promise<void>
  onClose: () => void
}) {
  const [details, setDetails] = useState<OrgDetailsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    () =>
      fetchDetails(orgId).then(
        (d) => {
          setDetails(d)
          setError(null)
        },
        (err: unknown) => setError(messageOf(err, 'Could not load this organization')),
      ),
    [orgId],
  )

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  // The panel opens below a possibly long table; bring it into view once.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Payouts and offer edits change both this panel and the overview's owed /
  // active-offer figures.
  const changed = useCallback(async () => {
    await Promise.all([load(), onOverviewChanged()])
  }, [load, onOverviewChanged])

  const settingsLabel = (tier: string) => (isVisibilityTier(tier) ? TIER_LABELS[tier] : tier)

  return (
    <section ref={panelRef} className="space-y-6 scroll-mt-6">
      <div className={`${CARD} p-5 space-y-5`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-black text-black dark:text-white">{orgName}</h2>
            {details && (
              <div className="text-xs text-gray-600 dark:text-zinc-400 mt-1 space-x-3">
                <span>
                  {details.selling.enabled && details.selling.platformSharePercent !== null
                    ? `LearnHoops share ${fmtPercent(details.selling.platformSharePercent)} · selling enabled`
                    : 'Selling disabled — set a share in the table above'}
                </span>
                <span>
                  Free tier: {settingsLabel(details.settings.freeTier)} · Unlock tier: {settingsLabel(details.settings.unlockTier)}
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} className={BTN_QUIET}>
            Close
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={() => void load()} className={BTN_SECONDARY}>
              Retry
            </button>
          </div>
        )}

        {!details && !error && <p className={`text-sm ${MUTED}`}>Loading...</p>}

        {details && (
          <>
            {/* Totals */}
            <TotalsCards totals={details.totals} />

            {/* Payouts */}
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-black text-black dark:text-white">Record payout</h3>
                <PayoutForm orgId={orgId} totals={details.totals} onSaved={changed} />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-black text-black dark:text-white">Payouts</h3>
                <PayoutsTable payouts={details.payouts} onRemoved={changed} />
              </div>
            </div>
          </>
        )}
      </div>

      {details && (
        <>
          <div className="space-y-3">
            <SectionTitle hint={`${details.sales.length} sale${details.sales.length === 1 ? '' : 's'}`}>Sales</SectionTitle>
            <SalesTable sales={details.sales} />
          </div>

          <div className="space-y-3">
            <SectionTitle hint="Prices in dollars. LearnHoops' cut per offer: a fixed fee wins when set (class sign-ups default to $100); otherwise the % override, else the org share">Offers</SectionTitle>
            {details.offers.length === 0 ? (
              <p className={`text-sm ${MUTED}`}>This organization has not created any offers yet.</p>
            ) : (
              <div className={`${CARD} divide-y divide-gray-200/70 dark:divide-zinc-800/50`}>
                {details.offers.map((offer) => (
                  <OfferRow
                    // Remount on any saved change so the draft never goes stale
                    // (e.g. all offers switch off when a split is cleared).
                    key={[
                      offer.id,
                      offer.title,
                      offer.regularPriceCents,
                      offer.clubPriceCents,
                      offer.discountPriceCents,
                      offer.active,
                      offer.platformSharePercent,
                    ].join(':')}
                    offer={offer}
                    orgSharePercent={details.selling.platformSharePercent}
                    onSaved={changed}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Totals cards
// ---------------------------------------------------------------------------

function TotalsCards({ totals }: { totals: CurrencyTotals[] }) {
  if (totals.length === 0) return <p className={`text-sm ${MUTED}`}>No sales yet.</p>
  return (
    <div className="space-y-3">
      {totals.map((t) => (
        <div key={t.currency} className="rounded-lg border border-gray-200 dark:border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CurrencyTag currency={t.currency} />
            <span className="text-xs text-gray-600 dark:text-zinc-400">
              {t.saleCount} sale{t.saleCount === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Gross" value={fmtMoney(t.grossCents, t.currency)} />
            <Stat label="Refunded" value={fmtMoney(t.refundedCents, t.currency)} />
            <Stat label="Org share" value={fmtMoney(t.orgShareCents, t.currency)} />
            <Stat label="LearnHoops share" value={fmtMoney(t.platformShareCents, t.currency)} />
            <Stat label="Paid out" value={fmtMoney(t.paidOutCents, t.currency)} />
            <Stat label="Owed" value={fmtMoney(t.owedCents, t.currency)} emphasis negative={t.owedCents < 0} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

function PayoutForm({ orgId, totals, onSaved }: { orgId: string; totals: CurrencyTotals[]; onSaved: () => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(() => largestOwedCurrency(totals))
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    const cents = dollarsToCents(amount)
    if (cents === undefined || cents === null || cents === 0) {
      setErr('Enter a non-zero amount in dollars.')
      return
    }
    setSaving(true)
    setErr(null)
    const r = await send('/api/admin/org-payouts', 'POST', {
      orgId,
      amountCents: cents,
      currency,
      method: method.trim() || undefined,
      note: note.trim() || undefined,
    })
    if (!r.ok) {
      setErr(r.error)
      setSaving(false)
      return
    }
    setAmount('')
    setMethod('')
    setNote('')
    await onSaved()
    setSaving(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <input
          type="number"
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (dollars)"
          disabled={saving}
          className={`${INPUT} w-36`}
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(isCurrency(e.target.value) ? e.target.value : 'usd')}
          disabled={saving}
          className={`${INPUT} w-24`}
        >
          <option value="usd">USD</option>
          <option value="cad">CAD</option>
        </select>
        <input
          type="text"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="Method (e.g. e-transfer)"
          maxLength={50}
          disabled={saving}
          className={`${INPUT} flex-1 min-w-[10rem]`}
        />
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        maxLength={1000}
        disabled={saving}
        className={`${INPUT} w-full`}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => void submit()} disabled={saving || amount.trim() === ''} className={BTN_PRIMARY}>
          {saving ? 'Recording...' : 'Record payout'}
        </button>
        <span className={`text-xs ${MUTED}`}>Negative amount = clawback adjustment (e.g. a refund after a payout).</span>
      </div>
      {err && <p className={ERROR_TEXT}>{err}</p>}
    </div>
  )
}

function PayoutsTable({ payouts, onRemoved }: { payouts: OrgPayoutRow[]; onRemoved: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function remove(p: OrgPayoutRow) {
    if (!confirm(`Remove the ${fmtMoney(p.amountCents, p.currency)} ${p.currency.toUpperCase()} payout from ${fmtDate(p.createdAt)}?`)) return
    setBusyId(p.id)
    setErr(null)
    const r = await send(`/api/admin/org-payouts?id=${encodeURIComponent(p.id)}`, 'DELETE')
    if (!r.ok) {
      setErr(r.error)
      setBusyId(null)
      return
    }
    await onRemoved()
    setBusyId(null)
  }

  if (payouts.length === 0) return <p className={`text-sm ${MUTED}`}>No payouts recorded.</p>

  return (
    <div className="space-y-1">
      <div className="rounded-lg border border-gray-200 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={THEAD}>
              <th className={TH}>Date</th>
              <th className={TH}>Amount</th>
              <th className={TH}>Method</th>
              <th className={TH}>Note</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className={TBODY}>
            {payouts.map((p) => (
              <tr key={p.id}>
                <td className={`${TD} text-xs text-gray-600 dark:text-zinc-400 whitespace-nowrap`}>{fmtDate(p.createdAt)}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  <span className="inline-flex items-center gap-1.5">
                    <CurrencyTag currency={p.currency} />
                    <span className={`font-semibold ${p.amountCents < 0 ? 'text-red-500' : 'text-black dark:text-white'}`}>
                      {fmtMoney(p.amountCents, p.currency)}
                    </span>
                  </span>
                </td>
                <td className={`${TD} text-xs text-gray-700 dark:text-zinc-300`}>{p.method ?? <span className={MUTED}>—</span>}</td>
                <td className={`${TD} text-xs text-gray-700 dark:text-zinc-300`}>{p.note ?? <span className={MUTED}>—</span>}</td>
                <td className={`${TD} text-right`}>
                  <button onClick={() => void remove(p)} disabled={busyId !== null} className={BTN_DANGER_QUIET}>
                    {busyId === p.id ? 'Removing...' : 'Remove'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <p className={ERROR_TEXT}>{err}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

function saleStatus(s: OrgSaleRow): { label: string; tone: 'green' | 'red' | 'yellow' | 'gray' } {
  if (s.status === 'refunded' || (s.amountCents > 0 && s.refundedCents >= s.amountCents)) return { label: 'refunded', tone: 'red' }
  if (s.refundedCents > 0) return { label: 'partial refund', tone: 'yellow' }
  if (s.status === 'paid') return { label: 'paid', tone: 'green' }
  return { label: s.status, tone: 'gray' }
}

function SalesTable({ sales }: { sales: OrgSaleRow[] }) {
  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={THEAD}>
            <th className={TH}>Date</th>
            <th className={TH}>Buyer</th>
            <th className={TH}>Offer</th>
            <th className={TH}>Paid</th>
            <th className={TH}>Refunded</th>
            <th className={TH}>Org share owed</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {sales.length === 0 ? (
            <tr>
              <td colSpan={7} className={`px-3 py-6 ${MUTED}`}>
                No sales yet.
              </td>
            </tr>
          ) : (
            sales.map((s) => {
              const st = saleStatus(s)
              return (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className={`${TD} text-xs text-gray-600 dark:text-zinc-400 whitespace-nowrap`}>{fmtDate(s.createdAt)}</td>
                  <td className={TD}>
                    <div className="font-medium text-black dark:text-white">{s.buyerName || '—'}</div>
                    <div className="text-xs text-gray-600 dark:text-zinc-400">{s.buyerEmail}</div>
                  </td>
                  <td className={TD}>
                    <div className="text-black dark:text-white">{s.offerTitle}</div>
                    <div className="mt-1">
                      <IncludesChips course={s.includesCourse} ball={s.includesBall} breakdown={s.includesBreakdown} />
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-bold text-orange-500">{fmtMoney(s.amountCents, s.currency)}</span>
                      <CurrencyTag currency={s.currency} />
                    </span>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {s.refundedCents > 0 ? (
                      <span className="text-red-500">{fmtMoney(s.refundedCents, s.currency)}</span>
                    ) : (
                      <span className={MUTED}>—</span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap font-semibold text-black dark:text-white`}>
                    <Money cents={s.orgShareOwedCents} currency={s.currency} />
                  </td>
                  <td className={TD}>
                    <div className="flex flex-wrap gap-1">
                      <Chip tone={st.tone}>{st.label}</Chip>
                      {s.includesBall && (
                        <Chip tone={s.shipStatus === 'shipped' ? 'green' : 'yellow'}>
                          ship: {s.shipStatus === 'shipped' ? 'shipped' : 'pending'}
                        </Chip>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Offers editor
// ---------------------------------------------------------------------------

function OfferRow({
  offer,
  orgSharePercent,
  onSaved,
}: {
  offer: OrgOffer
  orgSharePercent: number | null
  onSaved: () => Promise<void>
}) {
  const [title, setTitle] = useState(offer.title)
  const [regular, setRegular] = useState(centsToDollars(offer.regularPriceCents))
  const [club, setClub] = useState(centsToDollars(offer.clubPriceCents))
  const [discount, setDiscount] = useState(centsToDollars(offer.discountPriceCents))
  const [active, setActive] = useState(offer.active)
  const [split, setSplit] = useState(offer.platformSharePercent === null ? '' : String(offer.platformSharePercent))
  const [flatFee, setFlatFee] = useState(centsToDollars(offer.platformShareCents))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const dirty =
    title !== offer.title ||
    regular !== centsToDollars(offer.regularPriceCents) ||
    club !== centsToDollars(offer.clubPriceCents) ||
    discount !== centsToDollars(offer.discountPriceCents) ||
    active !== offer.active ||
    split !== (offer.platformSharePercent === null ? '' : String(offer.platformSharePercent)) ||
    flatFee !== centsToDollars(offer.platformShareCents)

  async function save() {
    const regularCents = dollarsToCents(regular)
    const clubCents = dollarsToCents(club)
    const discountCents = dollarsToCents(discount)
    if (regularCents === undefined || clubCents === undefined || discountCents === undefined) {
      setErr('Prices must be numbers in dollars.')
      return
    }
    if (regularCents === null) {
      setErr('Regular price is required.')
      return
    }
    let splitValue: number | null = null
    if (split.trim() !== '') {
      splitValue = parsePercentInput(split)
      if (splitValue === null) {
        setErr('Split override must be between 0 and 100, or blank to inherit.')
        return
      }
    }

    const flatCents = dollarsToCents(flatFee)
    if (flatCents === undefined || (flatCents !== null && flatCents < 0)) {
      setErr('Fixed fee must be a dollar amount, or blank for none.')
      return
    }

    const body: Record<string, unknown> = {
      title: title.trim(),
      regularPriceCents: regularCents,
      clubPriceCents: clubCents,
      discountPriceCents: discountCents,
      platformSharePercent: splitValue,
      platformShareCents: flatCents,
    }
    // Only send `active` when it changed: the server refuses `active: true`
    // while the org has no split, and an untouched flag should not trip that.
    if (active !== offer.active) body.active = active

    setSaving(true)
    setErr(null)
    const r = await send(`/api/admin/org-offers/${encodeURIComponent(offer.id)}`, 'PATCH', body)
    if (!r.ok) {
      setErr(r.error)
      setSaving(false)
      return
    }
    await onSaved()
    setSaving(false)
  }

  const priceInput = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      type="number"
      step={0.01}
      min={0}
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      disabled={saving}
      className={`${INPUT} w-24`}
    />
  )

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          disabled={saving}
          className={`${INPUT} flex-1 min-w-[12rem] font-medium`}
        />
        <Chip tone="gray">{KIND_LABELS[offer.kind]}</Chip>
        <IncludesChips course={offer.includesCourse} ball={offer.includesBall} breakdown={offer.includesBreakdown} />
        <span className={`text-xs ${MUTED}`}>unlocks {offer.unlockScope === 'player' ? 'every report for the player' : 'this report only'}</span>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="space-y-0.5">
          <span className={`block text-[11px] uppercase tracking-wide ${MUTED}`}>Regular</span>
          {priceInput(regular, setRegular, '49.99')}
        </label>
        <label className="space-y-0.5">
          <span className={`block text-[11px] uppercase tracking-wide ${MUTED}`}>Club</span>
          {priceInput(club, setClub, 'none')}
        </label>
        <label className="space-y-0.5">
          <span className={`block text-[11px] uppercase tracking-wide ${MUTED}`}>Discount</span>
          {priceInput(discount, setDiscount, 'none')}
        </label>
        <label className="space-y-0.5">
          <span className={`block text-[11px] uppercase tracking-wide ${MUTED}`}>LearnHoops fixed fee $</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={flatFee}
            onChange={(e) => setFlatFee(e.target.value)}
            placeholder="none (use %)"
            title="A fixed LearnHoops amount per sale. When set it replaces the percent for this offer."
            disabled={saving}
            className={`${INPUT} w-32`}
          />
        </label>
        <label className="space-y-0.5">
          <span className={`block text-[11px] uppercase tracking-wide ${MUTED}`}>Split override %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={split}
            onChange={(e) => setSplit(e.target.value)}
            placeholder={orgSharePercent === null ? 'inherit' : `inherit (${fmtPercent(orgSharePercent)})`}
            disabled={saving}
            className={`${INPUT} w-32`}
          />
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-black dark:text-white">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={saving}
            className="accent-orange-500 w-4 h-4"
          />
          Active
        </label>
        <div className="ml-auto flex items-center gap-2">
          {offer.shippingCents > 0 && <span className={`text-xs ${MUTED}`}>+ ${centsToDollars(offer.shippingCents)} shipping</span>}
          <button onClick={() => void save()} disabled={saving || !dirty} className={BTN_PRIMARY}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      {err && <p className={ERROR_TEXT}>{err}</p>}
    </div>
  )
}
