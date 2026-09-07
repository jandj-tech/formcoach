// Sales + earnings math for org offers. Every figure is grouped by currency:
// checkout settles in the buyer's currency (lib/region.ts), so one org can be
// owed CAD and USD at the same time and the two must never be summed together.
//
// Owed = Σ each base order's org share, scaled by how much of the charge is
// still unrefunded, minus Σ payouts in that currency. Partial refunds scale;
// a refund after a payout can drive owed negative — that's a clawback balance
// the admin nets against future sales (or records as a negative payout).

import { db } from '@/lib/db'
import { orgSharePercent } from '@/lib/org-offers'
import { statusIsEntitled } from '@/lib/team-features'

export interface OrgSaleRow {
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
  /** Org share after scaling for refunds. */
  orgShareOwedCents: number
  status: string
  shipStatus: string | null
}

export interface OrgPayoutRow {
  id: string
  amountCents: number
  currency: string
  method: string | null
  note: string | null
  createdAt: string
}

export interface CurrencyTotals {
  currency: string
  grossCents: number
  refundedCents: number
  orgShareCents: number
  platformShareCents: number
  paidOutCents: number
  owedCents: number
  saleCount: number
}

export function scaledOrgShare(orgShareCents: number, amountCents: number, refundedCents: number): number {
  if (amountCents <= 0) return 0
  const remaining = Math.max(0, amountCents - Math.max(0, refundedCents))
  return Math.round((orgShareCents * remaining) / amountCents)
}

export function totalsByCurrency(sales: OrgSaleRow[], payouts: OrgPayoutRow[]): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>()
  const get = (currency: string) => {
    const key = currency.toLowerCase()
    let t = map.get(key)
    if (!t) {
      t = {
        currency: key,
        grossCents: 0,
        refundedCents: 0,
        orgShareCents: 0,
        platformShareCents: 0,
        paidOutCents: 0,
        owedCents: 0,
        saleCount: 0,
      }
      map.set(key, t)
    }
    return t
  }
  for (const s of sales) {
    const t = get(s.currency)
    t.grossCents += s.amountCents
    t.refundedCents += s.refundedCents
    t.orgShareCents += s.orgShareOwedCents
    t.platformShareCents += Math.max(0, s.amountCents - s.refundedCents) - s.orgShareOwedCents
    t.saleCount += 1
  }
  for (const p of payouts) get(p.currency).paidOutCents += p.amountCents
  for (const t of map.values()) t.owedCents = t.orgShareCents - t.paidOutCents
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

interface SaleQueryRow {
  id: string
  created_at: Date
  email: string
  customer_name: string | null
  offer_id: string | null
  description: string | null
  amount_total: number
  currency: string
  org_share_cents: number
  platform_share_cents: number
  refunded_cents: number | null
  status: string
  kind: string | null
  includes_course: boolean | null
  includes_ball: boolean | null
  includes_breakdown: boolean | null
  ship_status: string | null
}

function mapSale(r: SaleQueryRow): OrgSaleRow {
  const refunded = r.refunded_cents ?? 0
  return {
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    buyerEmail: r.email,
    buyerName: r.customer_name,
    offerId: r.offer_id,
    offerTitle: r.description ?? 'Offer',
    kind: r.kind,
    includesCourse: !!r.includes_course,
    includesBall: !!r.includes_ball,
    includesBreakdown: !!r.includes_breakdown,
    amountCents: Number(r.amount_total),
    currency: r.currency,
    orgShareCents: Number(r.org_share_cents),
    platformShareCents: Number(r.platform_share_cents),
    refundedCents: refunded,
    orgShareOwedCents: scaledOrgShare(Number(r.org_share_cents), Number(r.amount_total), refunded),
    status: r.status,
    shipStatus: r.ship_status,
  }
}

/** Base order rows only (share columns are written on the base row alone). */
export async function orgSales(orgId: string): Promise<OrgSaleRow[]> {
  const rows = (await db`
    SELECT o.id, o.created_at, o.email, o.customer_name, o.offer_id, o.description,
           o.amount_total, o.currency, o.org_share_cents, o.platform_share_cents,
           o.refunded_cents, o.status,
           off.kind, off.includes_course, off.includes_ball, off.includes_breakdown,
           ball.status AS ship_status
    FROM orders o
    LEFT JOIN org_offers off ON off.id = o.offer_id
    LEFT JOIN orders ball ON ball.stripe_session_id = o.stripe_session_id || '__ball'
    WHERE o.org_id = ${orgId} AND o.kind = 'org_offer' AND o.org_share_cents IS NOT NULL
    ORDER BY o.created_at DESC
  `) as unknown as SaleQueryRow[]
  return rows.map(mapSale)
}

export async function orgPayouts(orgId: string): Promise<OrgPayoutRow[]> {
  const rows = (await db`
    SELECT id, amount_cents, currency, method, note, created_at
    FROM org_payouts WHERE org_id = ${orgId} ORDER BY created_at DESC
  `) as unknown as Array<{
    id: string
    amount_cents: number
    currency: string
    method: string | null
    note: string | null
    created_at: Date
  }>
  return rows.map((r) => ({
    id: r.id,
    amountCents: Number(r.amount_cents),
    currency: r.currency,
    method: r.method,
    note: r.note,
    createdAt: new Date(r.created_at).toISOString(),
  }))
}

export async function orgSalesSummary(orgId: string) {
  const [sales, payouts] = await Promise.all([orgSales(orgId), orgPayouts(orgId)])
  return { sales, payouts, totals: totalsByCurrency(sales, payouts) }
}

export interface OrgRevenueOverviewRow {
  orgId: string
  orgName: string
  adminEmail: string
  /** Per-org percent override; null = platform default. */
  platformSharePercent: number | null
  /** The percent actually applied (override or default). */
  effectivePercent: number
  entitled: boolean
  sellingDisabled: boolean
  offersRequestedAt: string | null
  activeOffers: number
  totals: CurrencyTotals[]
}

/**
 * Admin view: every organization with per-currency totals, quote requests
 * first. All orgs are listed (not just the ones that asked) so the admin can
 * enable selling for a club proactively after quoting it out of band.
 */
export async function orgRevenueOverview(): Promise<OrgRevenueOverviewRow[]> {
  const orgs = (await db`
    SELECT org.id, org.name, org.admin_email, org.platform_share_percent, org.offers_requested_at,
           org.selling_disabled, org.subscription_status,
           (SELECT COUNT(*)::int FROM org_offers oo WHERE oo.org_id = org.id AND oo.active) AS active_offers
    FROM organizations org
    ORDER BY active_offers DESC, org.name
  `) as unknown as Array<{
    id: string
    name: string
    admin_email: string
    platform_share_percent: string | null
    offers_requested_at: Date | null
    selling_disabled: boolean | null
    subscription_status: string | null
    active_offers: number
  }>
  const out: OrgRevenueOverviewRow[] = []
  for (const o of orgs) {
    const { totals } = await orgSalesSummary(o.id)
    const override = o.platform_share_percent == null ? null : parseFloat(o.platform_share_percent)
    out.push({
      orgId: o.id,
      orgName: o.name,
      adminEmail: o.admin_email,
      platformSharePercent: override,
      effectivePercent: orgSharePercent(override),
      entitled: statusIsEntitled(o.subscription_status),
      sellingDisabled: !!o.selling_disabled,
      offersRequestedAt: o.offers_requested_at ? new Date(o.offers_requested_at).toISOString() : null,
      activeOffers: o.active_offers,
      totals,
    })
  }
  return out
}
