import type Stripe from 'stripe'
import { db } from './db'
import { resolveBaseUrl } from './base-url'
import { claimStripeSession, releaseStripeSessionClaim } from './stripe-idempotency'
import { recordPurchase } from './record-purchase'
import { membershipStripe, type CheckoutLike } from './org-membership-stripe'
import {
  isMembershipPlan,
  isMembershipTerm,
  membershipEndsAt,
  membershipQuote,
  termLabel,
  type MembershipPlan,
  type MembershipQuote,
  type MembershipTerm,
} from './org-membership-pricing'
import { PLAYER_PLANS } from './player-plans'
import {
  effectivePlan,
  planRank,
  resolveEffectivePlan,
  type EffectivePlan,
  type EntitlementSeatRow,
  type EntitlementUserRow,
} from './player-entitlement'
import {
  sendOrgMembershipReceipt,
  sendOrgSeatsExpiringEmail,
  sendPersonalPlanPausedEmail,
  sendPersonalPlanResumedEmail,
  sendPlayerCoveredEmail,
  sendPlayerMembershipEndingEmail,
  sendSeatRemovedEmail,
} from './org-membership-emails'
import { issuePlayerSetupToken, setupEmailDailyOk } from './roster-players'
import { isMarketingSuppressed } from './email-list'
import { playerEmailPaused } from './player-email-pause'

/**
 * Org-sponsored player memberships: orders, seats, assignment, release,
 * personal-plan pause/resume, refunds and the daily lifecycle cron.
 *
 * Money rules (MEMBERSHIP-DESIGN.md / MEMBERSHIP-DECISIONS.md):
 *   - Prepaid Stripe Checkout (mode 'payment'); the order and its seats are
 *     written BEFORE checkout, and Stripe metadata carries only
 *     { type: 'org_membership_purchase', orderId } — never player ids.
 *   - Completion is idempotent across the webhook and /complete via
 *     claimStripeSession plus a pending→paid status transition.
 *   - A seat covers the holder's OWN uploads only (see /api/analyze).
 *   - One assigned seat per player (unique partial index).
 */

export type SeatStatus = 'pending_payment' | 'unassigned' | 'assigned' | 'expired' | 'refunded'
export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'expired'

export class MembershipError extends Error {
  constructor(
    message: string,
    public status: 400 | 402 | 403 | 404 | 409,
    public code?: 'no_account' | 'has_better_plan' | 'already_covered' | 'not_your_player' | 'seat_unavailable',
  ) {
    super(message)
  }
}

export interface OrderRow {
  id: string
  org_id: string
  plan: MembershipPlan
  term: MembershipTerm
  seats: number
  tier: number
  unit_cents: number
  total_cents: number
  currency: string
  status: OrderStatus
  starts_at: Date
  ends_at: Date
  pending_user_ids: string[]
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  refunded_cents: number
  paid_at: Date | null
  created_at: Date
}

export interface SeatRow {
  id: string
  order_id: string
  org_id: string
  plan: MembershipPlan
  term: MembershipTerm
  starts_at: Date
  ends_at: Date
  status: SeatStatus
  user_id: string | null
  assigned_at: Date | null
  anchor_at: Date | null
  paused_stripe_sub_id: string | null
  pause_checked_at: Date | null
}

const DAY_MS = 86_400_000
/** A player who held a seat this recently keeps their usage anchor on re-assignment. */
const ANCHOR_REUSE_DAYS = 31
/**
 * A player taken back and given another of the same org's memberships within
 * this window was MOVED: the covered email reads "now covers your … through
 * …" rather than as a brand-new membership.
 */
export const MOVE_WINDOW_MS = 10 * 60_000
/** Start dates may be set this far ahead. */
export const MAX_START_DAYS_AHEAD = 60

function dashboardUrl(): string {
  return `${resolveBaseUrl()}/org/dashboard?tab=memberships`
}

// --- small queries ---------------------------------------------------------------

/** Live, unexpired seats across all plans/terms — the top-up tier input. */
export async function liveSeatCount(orgId: string, sql: typeof db = db, now = new Date()): Promise<number> {
  const [row] = (await sql`
    SELECT COUNT(*)::int AS n
    FROM org_membership_seats s
    JOIN org_membership_orders o ON o.id = s.order_id
    WHERE s.org_id = ${orgId}
      AND o.status = 'paid'
      AND s.status IN ('assigned', 'unassigned')
      AND s.ends_at > ${now}
  `) as unknown as [{ n: number }]
  return row?.n ?? 0
}

/** Which of `userIds` are rostered on at least one of the org's teams. */
export async function playersOnOrgTeams(orgId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = (await db`
    SELECT DISTINCT tm.user_id::text AS user_id
    FROM team_memberships tm
    JOIN teams t ON t.id = tm.team_id
    WHERE t.organization_id = ${orgId}
      AND tm.user_id::text = ANY(${userIds}::text[])
  `) as unknown as Array<{ user_id: string }>
  return new Set(rows.map((r) => r.user_id))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/**
 * Parse the buyer's start date. 'YYYY-MM-DD', from today to today+60 days.
 * One day of slack before "today" in UTC so an evening buyer in the Americas
 * (already tomorrow in UTC) can still pick their local today. The seat starts
 * at 00:00 UTC that day and ends the same calendar date `term` months later.
 */
export function parseStartDate(value: unknown, now = new Date()): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MembershipError('Choose a start date.', 400)
  }
  const [y, m, d] = value.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d))
  if (start.getUTCFullYear() !== y || start.getUTCMonth() !== m - 1 || start.getUTCDate() !== d) {
    throw new MembershipError('Choose a valid start date.', 400)
  }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (start.getTime() < today - DAY_MS) throw new MembershipError('The start date can’t be in the past.', 400)
  if (start.getTime() > today + MAX_START_DAYS_AHEAD * DAY_MS) {
    throw new MembershipError(`The start date must be within ${MAX_START_DAYS_AHEAD} days.`, 400)
  }
  return start
}

// --- eligibility -------------------------------------------------------------------

export interface Eligibility {
  ok: boolean
  reason?: 'has_better_plan' | 'already_covered'
  message?: string
}

/** Pure: may a seat of `seatPlan` be assigned to a player whose entitlement is `eff`? */
export function seatEligibility(eff: EffectivePlan, seatPlan: MembershipPlan): Eligibility {
  if (eff.source === 'org' || eff.upcomingSeat) {
    return { ok: false, reason: 'already_covered', message: 'This player already has a membership seat.' }
  }
  if (eff.source === 'legacy') {
    return { ok: false, reason: 'has_better_plan', message: 'This player already has unlimited access.' }
  }
  if (eff.personal && planRank(eff.personal.plan) > planRank(seatPlan)) {
    return {
      ok: false,
      reason: 'has_better_plan',
      message: `This player already pays for ${PLAYER_PLANS[eff.personal.plan].name}, which is better than this seat.`,
    }
  }
  return { ok: true }
}

// --- ordering ------------------------------------------------------------------------

export interface CreateOrderInput {
  orgId: string
  createdBy: string | null
  plan: unknown
  term: unknown
  seats: unknown
  startDate: unknown
  userIds?: unknown
  currency: string
  now?: Date
}

/**
 * Validate and write a pending order plus its pending_payment seats. The org
 * row is locked while live seats are counted, so the tier is priced from a
 * consistent snapshot. Does NOT talk to Stripe — the route opens checkout
 * for the returned order (see createMembershipCheckout).
 */
export async function createMembershipOrder(input: CreateOrderInput): Promise<{ order: OrderRow; quote: MembershipQuote }> {
  const now = input.now ?? new Date()
  if (!isMembershipPlan(input.plan)) throw new MembershipError('Choose Player or Pro.', 400)
  if (!isMembershipTerm(input.term)) throw new MembershipError('Choose a term.', 400)
  const plan = input.plan
  const term = input.term
  const seats = typeof input.seats === 'number' ? input.seats : NaN
  if (!Number.isInteger(seats) || seats < 1) throw new MembershipError('Enter a whole number of seats.', 400)
  const startsAt = parseStartDate(input.startDate, now)
  const endsAt = membershipEndsAt(startsAt, term)

  let userIds: string[] = []
  if (input.userIds !== undefined && input.userIds !== null) {
    if (!Array.isArray(input.userIds)) throw new MembershipError('userIds must be a list.', 400)
    if (!input.userIds.every(isUuid)) throw new MembershipError('Unknown player.', 400)
    userIds = [...new Set(input.userIds as string[])]
  }
  if (userIds.length > seats) throw new MembershipError('You picked more players than seats.', 400)

  if (userIds.length > 0) {
    const onOrg = await playersOnOrgTeams(input.orgId, userIds)
    if (userIds.some((id) => !onOrg.has(id))) {
      throw new MembershipError('One or more players are not on your teams.', 403, 'not_your_player')
    }
    for (const uid of userIds) {
      const eff = await effectivePlan(uid, now)
      const e = seatEligibility(eff, plan)
      if (!e.ok) throw new MembershipError(e.message!, 409, e.reason)
    }
  }

  return (await db.begin(async (tx) => {
    const sql = tx as unknown as typeof db
    await sql`SELECT id FROM organizations WHERE id = ${input.orgId} FOR UPDATE`
    const live = await liveSeatCount(input.orgId, sql, now)
    let quote: MembershipQuote
    try {
      quote = membershipQuote(plan, term, seats, live)
    } catch (err) {
      throw new MembershipError(err instanceof Error ? err.message : 'Invalid order', 400)
    }
    const [order] = (await sql`
      INSERT INTO org_membership_orders
        (org_id, plan, term, seats, tier, unit_cents, total_cents, currency, status,
         starts_at, ends_at, pending_user_ids, created_by)
      VALUES
        (${input.orgId}, ${plan}, ${term}, ${seats}, ${quote.tier}, ${quote.unitCents}, ${quote.totalCents},
         ${input.currency}, 'pending', ${startsAt}, ${endsAt}, ${userIds}::uuid[], ${input.createdBy})
      RETURNING *
    `) as unknown as [OrderRow]
    await sql`
      INSERT INTO org_membership_seats (order_id, org_id, plan, term, starts_at, ends_at, status)
      SELECT ${order.id}, ${input.orgId}, ${plan}, ${term}, ${startsAt}, ${endsAt}, 'pending_payment'
      FROM generate_series(1, ${seats})
    `
    return { order, quote }
  })) as { order: OrderRow; quote: MembershipQuote }
}

/** The Checkout for an order. Metadata is ONLY { type, orderId }. */
export async function createMembershipCheckout(order: OrderRow, customerEmail: string | null): Promise<string> {
  const planName = PLAYER_PLANS[order.plan].name
  const fmt = (dt: Date) => new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const base = resolveBaseUrl()
  const checkout = await membershipStripe().createCheckout({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: order.seats,
        price_data: {
          currency: order.currency,
          unit_amount: order.unit_cents,
          product_data: {
            name: `${planName} membership, ${termLabel(order.term)}`,
            // ends_at is exclusive: name the last covered day, like the receipt and dashboard.
            description: `${fmt(order.starts_at)} through ${fmt(new Date(new Date(order.ends_at).getTime() - 1))}. Prepaid, does not renew.`,
          },
        },
      },
    ],
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    invoice_creation: { enabled: true },
    metadata: { type: 'org_membership_purchase', orderId: order.id },
    success_url: `${base}/org/dashboard?tab=memberships&membership_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/org/dashboard?tab=memberships`,
  })
  await db`UPDATE org_membership_orders SET stripe_session_id = ${checkout.id} WHERE id = ${order.id}`
  if (!checkout.url) throw new Error('Stripe returned no checkout URL')
  return checkout.url
}

// --- completion --------------------------------------------------------------------

type SessionInput = Pick<CheckoutLike, 'id' | 'metadata' | 'payment_status' | 'amount_total' | 'currency'> & {
  payment_intent?: string | { id: string } | null
  customer_details?: { email?: string | null; name?: string | null } | null
  customer_email?: string | null
}

export interface CompletionResult {
  order: OrderRow | null
  applied: boolean
  reason?: 'not_membership' | 'unpaid' | 'unknown_order' | 'session_mismatch' | 'already_processed'
}

/**
 * Fulfil a paid membership checkout. Shared by the webhook and
 * /api/org/memberships/complete; whichever arrives first applies it and the
 * other returns { applied: false, reason: 'already_processed' }.
 */
export async function completeMembershipOrder(session: SessionInput): Promise<CompletionResult> {
  if (session.metadata?.type !== 'org_membership_purchase') return { order: null, applied: false, reason: 'not_membership' }
  const orderId = session.metadata?.orderId
  if (!isUuid(orderId)) return { order: null, applied: false, reason: 'unknown_order' }
  if (session.payment_status === 'unpaid') return { order: null, applied: false, reason: 'unpaid' }

  const [existing] = (await db`SELECT * FROM org_membership_orders WHERE id = ${orderId}`) as unknown as [OrderRow | undefined]
  if (!existing) return { order: null, applied: false, reason: 'unknown_order' }
  if (existing.stripe_session_id && existing.stripe_session_id !== session.id) {
    console.error('[org-membership] session/order mismatch', { orderId, sessionId: session.id })
    return { order: existing, applied: false, reason: 'session_mismatch' }
  }
  if (existing.status !== 'pending') return { order: existing, applied: false, reason: 'already_processed' }

  const claim = await claimStripeSession(session.id, existing.seats, `org:${existing.org_id}`)
  if (claim === 'already_processed') {
    const [fresh] = (await db`SELECT * FROM org_membership_orders WHERE id = ${orderId}`) as unknown as [OrderRow]
    return { order: fresh, applied: false, reason: 'already_processed' }
  }

  const paymentIntent =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  if (session.amount_total != null && session.amount_total !== existing.total_cents) {
    // No promotion codes are offered on memberships, so this is unexpected.
    console.error('[org-membership] amount mismatch — review', {
      orderId, expected: existing.total_cents, charged: session.amount_total,
    })
  }

  let order: OrderRow | undefined
  try {
    order = (await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db
      const [o] = (await sql`
        UPDATE org_membership_orders
        SET status = 'paid', paid_at = NOW(),
            stripe_session_id = COALESCE(stripe_session_id, ${session.id}),
            stripe_payment_intent_id = COALESCE(${paymentIntent}, stripe_payment_intent_id)
        WHERE id = ${orderId} AND status = 'pending'
        RETURNING *
      `) as unknown as [OrderRow | undefined]
      if (!o) return undefined
      await sql`
        UPDATE org_membership_seats SET status = 'unassigned', updated_at = NOW()
        WHERE order_id = ${orderId} AND status = 'pending_payment'
      `
      return o
    })) as OrderRow | undefined
  } catch (err) {
    if (claim === 'claimed') await releaseStripeSessionClaim(session.id, 'org_membership_failed')
    throw err
  }
  if (!order) {
    const [fresh] = (await db`SELECT * FROM org_membership_orders WHERE id = ${orderId}`) as unknown as [OrderRow]
    return { order: fresh, applied: false, reason: 'already_processed' }
  }

  // Assign the players picked at checkout. Best-effort per player: one who
  // became ineligible while checkout was open (bought Pro, left the team)
  // just leaves their seat unassigned for the org to hand to someone else.
  const pending = order.pending_user_ids ?? []
  if (pending.length > 0) {
    const seatIds = (await db`
      SELECT id FROM org_membership_seats WHERE order_id = ${order.id} AND status = 'unassigned'
      ORDER BY created_at, id LIMIT ${pending.length}
    `) as unknown as Array<{ id: string }>
    for (let i = 0; i < pending.length && i < seatIds.length; i++) {
      try {
        await assignSeat(order.org_id, seatIds[i].id, pending[i])
      } catch (err) {
        console.warn('[org-membership] could not assign on payment', {
          orderId: order.id, userId: pending[i], error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  const [org] = (await db`SELECT name, admin_email FROM organizations WHERE id = ${order.org_id}`) as unknown as [
    { name: string; admin_email: string } | undefined,
  ]
  if (org?.admin_email) {
    try {
      await sendOrgMembershipReceipt(org.admin_email, {
        orgName: org.name,
        plan: order.plan,
        term: order.term,
        seats: order.seats,
        unitCents: order.unit_cents,
        totalCents: order.total_cents,
        currency: order.currency,
        startsAt: new Date(order.starts_at),
        endsAt: new Date(order.ends_at),
        dashboardUrl: dashboardUrl(),
      })
    } catch (err) {
      console.error('[org-membership] receipt email failed (order is paid):', err)
    }
  }

  await recordPurchase(
    {
      ...(session as object),
      id: session.id,
      payment_intent: paymentIntent,
      amount_total: session.amount_total ?? order.total_cents,
      currency: session.currency ?? order.currency,
      customer_details: session.customer_details ?? null,
      customer_email: session.customer_email ?? null,
    } as unknown as Stripe.Checkout.Session,
    {
      kind: 'org_memberships',
      description: `${order.seats} × ${PLAYER_PLANS[order.plan].name} membership, ${termLabel(order.term)}`,
      quantity: order.seats,
      email: session.customer_details?.email ?? org?.admin_email ?? null,
      buyerKind: 'org',
      buyerRef: order.org_id,
    },
  )

  return { order, applied: true }
}

// --- assignment ----------------------------------------------------------------------

interface HolderRow {
  id: string
  email: string
  first_name: string | null
  roster_pending: boolean | null
  stripe_subscription_id: string | null
}

/**
 * The account holder. With `orgId`, first_name is the name(s) that org's
 * rosters use for the account (team_memberships), not users.first_name:
 * siblings can share one account ("Liam and Harper"), and the account's own
 * first name is whichever child signed up first. Falls back to
 * users.first_name when the player is on no team of the org any more.
 */
async function holder(userId: string, orgId?: string): Promise<HolderRow | undefined> {
  const [u] = (await db`
    SELECT id, email, first_name, roster_pending, stripe_subscription_id FROM users WHERE id = ${userId}
  `) as unknown as [HolderRow | undefined]
  if (u && orgId) {
    const first = await orgFirstNames(userId, orgId)
    if (first) u.first_name = first
  }
  return u
}

/** One roster entry's display name: "Harper S." (first name + last initial), as the org dashboard shows it. */
export function rosterDisplayName(first: string | null | undefined, lastInitial: string | null | undefined): string {
  const f = first?.trim() || 'Player'
  const l = lastInitial?.trim()
  return l ? `${f} ${l.toUpperCase()}.` : f
}

/** "Liam", "Liam and Harper", "Liam, Harper and Noah". */
function joinFirstNames(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Distinct first names the org's team rosters use for this account, or null. */
async function orgFirstNames(userId: string, orgId: string): Promise<string | null> {
  const rows = (await db`
    SELECT tm.first_name FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ${userId} AND t.organization_id = ${orgId} AND tm.first_name IS NOT NULL
    ORDER BY t.name, tm.first_name
  `) as unknown as Array<{ first_name: string }>
  const seen = new Set<string>()
  const names: string[] = []
  for (const r of rows) {
    const n = r.first_name.trim()
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase())
      names.push(n)
    }
  }
  return joinFirstNames(names)
}

async function orgName(orgId: string): Promise<string> {
  const [o] = (await db`SELECT name FROM organizations WHERE id = ${orgId}`) as unknown as [{ name: string } | undefined]
  return o?.name ?? 'Your club'
}

/** Seats left 'assigned' with no holder (the user row was deleted) are really unassigned. */
async function normalizeOrphanSeats(orgId?: string): Promise<void> {
  if (orgId) {
    await db`
      UPDATE org_membership_seats SET status = 'unassigned', assigned_at = NULL, anchor_at = NULL,
             paused_stripe_sub_id = NULL, pause_checked_at = NULL, updated_at = NOW()
      WHERE org_id = ${orgId} AND status = 'assigned' AND user_id IS NULL
    `
  } else {
    await db`
      UPDATE org_membership_seats SET status = 'unassigned', assigned_at = NULL, anchor_at = NULL,
             paused_stripe_sub_id = NULL, pause_checked_at = NULL, updated_at = NOW()
      WHERE status = 'assigned' AND user_id IS NULL
    `
  }
}

export interface AssignOptions {
  notify?: boolean
  now?: Date
}

/**
 * Give an unassigned seat to a rostered player. Throws MembershipError:
 * 404 unknown seat, 403 not on the org's teams, 409 seat not assignable /
 * player already covered / player has a better plan.
 */
export async function assignSeat(orgId: string, seatId: string, userId: string, opts: AssignOptions = {}): Promise<SeatRow> {
  const now = opts.now ?? new Date()
  if (!isUuid(seatId)) throw new MembershipError('Seat not found.', 404)
  if (!isUuid(userId)) throw new MembershipError('Player not found.', 404)
  await normalizeOrphanSeats(orgId)

  const [seat] = (await db`SELECT * FROM org_membership_seats WHERE id = ${seatId} AND org_id = ${orgId}`) as unknown as [SeatRow | undefined]
  if (!seat) throw new MembershipError('Seat not found.', 404)
  if (seat.status !== 'unassigned') throw new MembershipError('That seat is not available.', 409, 'seat_unavailable')
  if (new Date(seat.ends_at).getTime() <= now.getTime()) throw new MembershipError('That seat has ended.', 409, 'seat_unavailable')

  const onOrg = await playersOnOrgTeams(orgId, [userId])
  if (!onOrg.has(userId)) throw new MembershipError('That player is not on your teams.', 403, 'not_your_player')

  const eff = await effectivePlan(userId, now)
  const e = seatEligibility(eff, seat.plan)
  if (!e.ok) throw new MembershipError(e.message!, 409, e.reason)

  // Re-assigning someone who held a seat in this org recently keeps their
  // anchor, so moving a seat back and forth can't reset a usage window.
  const [prev] = (await db`
    SELECT anchor_at FROM org_membership_seat_history
    WHERE user_id = ${userId} AND org_id = ${orgId}
      AND (released_at IS NULL OR released_at > ${new Date(now.getTime() - ANCHOR_REUSE_DAYS * DAY_MS)})
    ORDER BY assigned_at DESC LIMIT 1
  `) as unknown as [{ anchor_at: Date } | undefined]
  const startsAt = new Date(seat.starts_at)
  const anchor = prev?.anchor_at && new Date(prev.anchor_at).getTime() >= startsAt.getTime()
    ? new Date(prev.anchor_at)
    : new Date(Math.max(startsAt.getTime(), now.getTime()))

  let updated: SeatRow | undefined
  try {
    updated = (await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db
      const [s] = (await sql`
        UPDATE org_membership_seats
        SET status = 'assigned', user_id = ${userId}, assigned_at = ${now}, anchor_at = ${anchor},
            paused_stripe_sub_id = NULL, pause_checked_at = NULL, player_reminded_7_at = NULL,
            ended_email_at = NULL, updated_at = NOW()
        WHERE id = ${seatId} AND org_id = ${orgId} AND status = 'unassigned' AND ends_at > ${now}
        RETURNING *
      `) as unknown as [SeatRow | undefined]
      if (!s) return undefined
      await sql`
        INSERT INTO org_membership_seat_history (seat_id, org_id, user_id, anchor_at, assigned_at)
        VALUES (${seatId}, ${orgId}, ${userId}, ${anchor}, ${now})
      `
      return s
    })) as SeatRow | undefined
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      throw new MembershipError('This player already has a membership seat.', 409, 'already_covered')
    }
    throw err
  }
  if (!updated) throw new MembershipError('That seat is not available.', 409, 'seat_unavailable')

  if (new Date(updated.starts_at).getTime() <= now.getTime()) {
    updated = (await applyPersonalPause(updated, now)) ?? updated
  }

  if (opts.notify !== false) {
    // Taken back and given another one moments ago = a move, worded as one.
    const [recent] = (await db`
      SELECT 1 AS x FROM org_membership_seat_history
      WHERE user_id = ${userId} AND org_id = ${orgId}
        AND released_at > ${new Date(now.getTime() - MOVE_WINDOW_MS)} AND reason IN ('unassigned', 'moved')
      LIMIT 1
    `) as unknown as [{ x: number } | undefined]
    await notifyCovered(orgId, userId, updated, !!recent)
  }
  return updated
}

async function notifyCovered(orgId: string, userId: string, seat: SeatRow, moved: boolean): Promise<void> {
  const u = await holder(userId, orgId)
  if (!u?.email) return
  // Player emails paused for testing (lib/player-email-pause.ts): no notice,
  // and no setup link minted or counted against the daily cap.
  if (playerEmailPaused('player membership covered', u.email)) return
  try {
    // The setup link counts toward the player's daily setup-email cap, so an
    // assign/unassign loop can't flood a family inbox with links. Over the cap
    // the covered notice still goes out, just without the link.
    const setupUrl = u.roster_pending && (await setupEmailDailyOk(userId))
      ? (await issuePlayerSetupToken(userId)) ?? undefined
      : undefined
    await sendPlayerCoveredEmail(u.email, {
      playerFirstName: u.first_name,
      orgName: await orgName(orgId),
      plan: seat.plan,
      endsAt: new Date(seat.ends_at),
      hasAccount: !u.roster_pending,
      setupUrl,
      moved,
    })
  } catch (err) {
    console.error('[org-membership] covered email failed (seat is assigned):', err)
  }
}

export interface MoveOptions {
  notify?: boolean
  now?: Date
}

/**
 * Move a covered player from the seat they hold to another unassigned seat of
 * the same org, in ONE step: they are never uncovered in between, their usage
 * anchor carries over, a paused personal Stripe plan stays paused (its resume
 * date follows the new seat's end), and they get exactly one email ("<Org>
 * now covers your <Plan> membership through <date>") instead of "no longer
 * covers you" followed by "is covering you". The old seat goes back to the
 * pool. Throws MembershipError: 404 unknown seat/player, 409 player holds no
 * seat of this org / target not available / not started yet / player's own
 * plan is better than the target.
 */
export async function moveSeat(orgId: string, userId: string, toSeatId: string, opts: MoveOptions = {}): Promise<SeatRow> {
  const now = opts.now ?? new Date()
  if (!isUuid(toSeatId)) throw new MembershipError('Membership not found.', 404)
  if (!isUuid(userId)) throw new MembershipError('Player not found.', 404)
  await normalizeOrphanSeats(orgId)

  const [from] = (await db`
    SELECT * FROM org_membership_seats WHERE org_id = ${orgId} AND user_id = ${userId} AND status = 'assigned'
  `) as unknown as [SeatRow | undefined]
  if (!from) throw new MembershipError('This player doesn’t have one of your memberships to switch from.', 409, 'seat_unavailable')
  if (from.id === toSeatId) throw new MembershipError('The player already has that membership.', 409, 'seat_unavailable')

  const [to] = (await db`SELECT * FROM org_membership_seats WHERE id = ${toSeatId} AND org_id = ${orgId}`) as unknown as [SeatRow | undefined]
  if (!to) throw new MembershipError('Membership not found.', 404)
  if (to.status !== 'unassigned' || new Date(to.ends_at).getTime() <= now.getTime()) {
    throw new MembershipError('That membership is not available.', 409, 'seat_unavailable')
  }
  if (new Date(to.starts_at).getTime() > now.getTime()) {
    throw new MembershipError('That membership hasn’t started yet, so the player can’t switch to it now.', 409, 'seat_unavailable')
  }

  const eff = await effectivePlan(userId, now)
  if (eff.source === 'legacy') throw new MembershipError('This player already has unlimited access.', 409, 'has_better_plan')
  if (eff.personal && planRank(eff.personal.plan) > planRank(to.plan)) {
    throw new MembershipError(
      `This player already pays for ${PLAYER_PLANS[eff.personal.plan].name}, which is better than that membership.`,
      409,
      'has_better_plan',
    )
  }

  const toStarts = new Date(to.starts_at).getTime()
  const anchor = from.anchor_at && new Date(from.anchor_at).getTime() >= toStarts
    ? new Date(from.anchor_at)
    : new Date(Math.max(toStarts, now.getTime()))

  let moved: SeatRow
  try {
    moved = (await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db
      const released = (await sql`
        UPDATE org_membership_seats
        SET status = 'unassigned', user_id = NULL, assigned_at = NULL, anchor_at = NULL,
            paused_stripe_sub_id = NULL, pause_checked_at = NULL, player_reminded_7_at = NULL, updated_at = NOW()
        WHERE id = ${from.id} AND org_id = ${orgId} AND user_id = ${userId} AND status = 'assigned'
        RETURNING id
      `) as unknown as unknown[]
      if (released.length === 0) throw new MembershipError('That player’s membership just changed. Refresh and try again.', 409, 'seat_unavailable')
      const [s] = (await sql`
        UPDATE org_membership_seats
        SET status = 'assigned', user_id = ${userId}, assigned_at = ${now}, anchor_at = ${anchor},
            paused_stripe_sub_id = NULL, pause_checked_at = NULL, player_reminded_7_at = NULL,
            ended_email_at = NULL, updated_at = NOW()
        WHERE id = ${toSeatId} AND org_id = ${orgId} AND status = 'unassigned' AND ends_at > ${now}
        RETURNING *
      `) as unknown as [SeatRow | undefined]
      if (!s) throw new MembershipError('That membership is not available.', 409, 'seat_unavailable')
      await sql`
        UPDATE org_membership_seat_history SET released_at = ${now}, reason = 'moved'
        WHERE seat_id = ${from.id} AND user_id = ${userId} AND released_at IS NULL
      `
      await sql`
        INSERT INTO org_membership_seat_history (seat_id, org_id, user_id, anchor_at, assigned_at)
        VALUES (${toSeatId}, ${orgId}, ${userId}, ${anchor}, ${now})
      `
      return s
    })) as SeatRow
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      throw new MembershipError('This player already has a membership seat.', 409, 'already_covered')
    }
    throw err
  }

  // The personal plan under the old seat: keep it paused (the new seat is at
  // least as good — checked above), just move the resume date; an App Store
  // player was already emailed the cancel steps. Otherwise run the normal
  // check (e.g. their own Pro sat above a Player seat and a Pro seat now covers).
  const personal = eff.personal
  const appleAlreadyTold =
    !!from.pause_checked_at && personal?.billedVia === 'apple' && planRank(from.plan) >= planRank(personal.plan)
  if (from.paused_stripe_sub_id) {
    if (new Date(from.ends_at).getTime() !== new Date(moved.ends_at).getTime()) {
      try {
        await membershipStripe().pauseSubscription(from.paused_stripe_sub_id, new Date(moved.ends_at))
      } catch (err) {
        console.error('[org-membership] moving the personal pause failed — it resumes at the old seat end', { seatId: moved.id, err })
      }
    }
    const [s] = (await db`
      UPDATE org_membership_seats SET paused_stripe_sub_id = ${from.paused_stripe_sub_id}, pause_checked_at = ${now}, updated_at = NOW()
      WHERE id = ${moved.id} AND user_id = ${userId} RETURNING *
    `) as unknown as [SeatRow | undefined]
    moved = s ?? moved
  } else if (appleAlreadyTold) {
    const [s] = (await db`
      UPDATE org_membership_seats SET pause_checked_at = ${now}, updated_at = NOW()
      WHERE id = ${moved.id} AND user_id = ${userId} RETURNING *
    `) as unknown as [SeatRow | undefined]
    moved = s ?? moved
  } else {
    moved = (await applyPersonalPause(moved, now)) ?? moved
  }

  if (opts.notify !== false) await notifyCovered(orgId, userId, moved, true)
  return moved
}

/**
 * The holder's personal plan while a live seat covers them. Stripe: pause
 * collection until the seat ends (behavior 'void' — they keep the period they
 * already paid for and are not billed while the pass runs; billing resumes on
 * its own at resumes_at). Apple can't be paused from a server: email the
 * steps to cancel in iPhone Settings. Only when the seat is at least as good
 * as the personal plan. Runs once per holder (pause_checked_at).
 */
export async function applyPersonalPause(seat: SeatRow, now = new Date()): Promise<SeatRow | null> {
  if (!seat.user_id || seat.pause_checked_at) return null
  const userId = seat.user_id
  let pausedSubId: string | null = null
  try {
    const eff = await effectivePlan(userId, now)
    const personal = eff.personal
    if (personal && planRank(seat.plan) >= planRank(personal.plan) && eff.source === 'org') {
      const u = await holder(userId, seat.org_id)
      const name = await orgName(seat.org_id)
      if (personal.billedVia === 'stripe' && u?.stripe_subscription_id) {
        await membershipStripe().pauseSubscription(u.stripe_subscription_id, new Date(seat.ends_at))
        pausedSubId = u.stripe_subscription_id
      }
      if (u?.email) {
        try {
          await sendPersonalPlanPausedEmail(u.email, {
            playerFirstName: u.first_name,
            orgName: name,
            resumesAt: new Date(seat.ends_at),
            billedVia: personal.billedVia,
          })
        } catch (err) {
          console.error('[org-membership] paused email failed:', err)
        }
      }
    }
  } catch (err) {
    // A failed pause must not undo the assignment; the player is covered either
    // way, and pause_checked_at stays NULL so the cron retries.
    console.error('[org-membership] personal plan pause failed, will retry:', { seatId: seat.id, err })
    return null
  }
  const [s] = (await db`
    UPDATE org_membership_seats
    SET pause_checked_at = ${now}, paused_stripe_sub_id = ${pausedSubId}, updated_at = NOW()
    WHERE id = ${seat.id} AND user_id = ${userId}
    RETURNING *
  `) as unknown as [SeatRow | undefined]
  return s ?? null
}

async function resumePersonalPlan(userId: string, subId: string, orgId: string, notify: boolean): Promise<void> {
  try {
    await membershipStripe().resumeSubscription(subId)
  } catch (err) {
    console.error('[org-membership] resume failed — pause_collection still set; it auto-resumes at the seat end', { subId, err })
    return
  }
  if (!notify) return
  const u = await holder(userId, orgId)
  if (u?.email) {
    try {
      await sendPersonalPlanResumedEmail(u.email, { playerFirstName: u.first_name, orgName: await orgName(orgId) })
    } catch (err) {
      console.error('[org-membership] resumed email failed:', err)
    }
  }
}

export interface UnassignOptions {
  reason?: 'unassigned' | 'left_org' | 'account_deleted' | 'refunded'
  notify?: boolean
  /** Where the seat goes: back to the pool (default) or refunded. */
  toStatus?: 'unassigned' | 'refunded'
}

/**
 * Take a seat back from its holder. The seat keeps its term and returns to
 * the pool; analyses the holder used stay counted against them. A paused
 * personal Stripe plan resumes.
 */
export async function unassignSeat(orgId: string, seatId: string, opts: UnassignOptions = {}): Promise<SeatRow> {
  if (!isUuid(seatId)) throw new MembershipError('Seat not found.', 404)
  const toStatus = opts.toStatus ?? 'unassigned'
  const [row] = (await db`
    WITH old AS (
      SELECT id, user_id, paused_stripe_sub_id FROM org_membership_seats
      WHERE id = ${seatId} AND org_id = ${orgId} AND status = 'assigned'
      FOR UPDATE
    )
    UPDATE org_membership_seats s
    SET status = ${toStatus}, user_id = NULL, assigned_at = NULL, anchor_at = NULL,
        paused_stripe_sub_id = NULL, pause_checked_at = NULL, player_reminded_7_at = NULL, updated_at = NOW()
    FROM old
    WHERE s.id = old.id
    RETURNING s.*, old.user_id AS old_user_id, old.paused_stripe_sub_id AS old_paused
  `) as unknown as [(SeatRow & { old_user_id: string | null; old_paused: string | null }) | undefined]
  if (!row) {
    const [exists] = (await db`SELECT status FROM org_membership_seats WHERE id = ${seatId} AND org_id = ${orgId}`) as unknown as [{ status: string } | undefined]
    if (!exists) throw new MembershipError('Seat not found.', 404)
    throw new MembershipError('That membership isn’t given to anyone right now.', 409, 'seat_unavailable')
  }
  const oldUser = row.old_user_id
  if (oldUser) {
    await db`
      UPDATE org_membership_seat_history SET released_at = NOW(), reason = ${opts.reason ?? 'unassigned'}
      WHERE seat_id = ${seatId} AND user_id = ${oldUser} AND released_at IS NULL
    `
    const notify = opts.notify !== false && opts.reason !== 'account_deleted'
    if (row.old_paused) await resumePersonalPlan(oldUser, row.old_paused, orgId, notify)
    if (notify) {
      const u = await holder(oldUser, orgId)
      if (u?.email) {
        try {
          await sendSeatRemovedEmail(u.email, { playerFirstName: u.first_name, orgName: await orgName(orgId) })
        } catch (err) {
          console.error('[org-membership] seat-removed email failed:', err)
        }
      }
    }
  }
  const { old_user_id: _u, old_paused: _p, ...seat } = row
  void _u
  void _p
  return seat as SeatRow
}

/**
 * Called by every leave/remove path AFTER the membership row is gone: if the
 * player is on no team of `orgId` any more, their seat from that org goes
 * back to the pool. Never throws — leaving a team must not fail on this.
 */
export async function releaseSeatIfLeftOrg(userId: string, orgId: string | null | undefined): Promise<number> {
  if (!userId || !orgId) return 0
  try {
    const still = (await db`
      SELECT 1 FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${userId} AND t.organization_id = ${orgId} LIMIT 1
    `) as unknown as unknown[]
    if (still.length > 0) return 0
    const seats = (await db`
      SELECT id FROM org_membership_seats WHERE user_id = ${userId} AND org_id = ${orgId} AND status = 'assigned'
    `) as unknown as Array<{ id: string }>
    for (const s of seats) await unassignSeat(orgId, s.id, { reason: 'left_org' })
    return seats.length
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/relation .* does not exist/i.test(msg)) console.error('[org-membership] release on leave failed:', { userId, orgId, msg })
    return 0
  }
}

/** Account deletion: every seat the user holds goes back to its org's pool, silently. */
export async function releaseSeatsForDeletedUser(userId: string): Promise<number> {
  try {
    const seats = (await db`
      SELECT id, org_id FROM org_membership_seats WHERE user_id = ${userId} AND status = 'assigned'
    `) as unknown as Array<{ id: string; org_id: string }>
    for (const s of seats) await unassignSeat(s.org_id, s.id, { reason: 'account_deleted', notify: false })
    return seats.length
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/relation .* does not exist/i.test(msg)) console.error('[org-membership] release on delete failed:', { userId, msg })
    return 0
  }
}

// --- refunds -------------------------------------------------------------------------

/**
 * charge.refunded for a membership order. amount_refunded is Stripe's running
 * total. A full refund refunds every seat (assigned ones are taken back). A
 * partial refund of N × unit price refunds N UNASSIGNED seats (the 14-day
 * return of unused seats is an admin action in Stripe); if there aren't
 * enough unassigned seats it refunds what it can and logs for review.
 * Returns false when the payment intent is not a membership order.
 */
export async function applyMembershipRefund(paymentIntentId: string, amountRefunded: number, fullyRefunded: boolean): Promise<boolean> {
  let order: OrderRow | undefined
  try {
    ;[order] = (await db`
      SELECT * FROM org_membership_orders WHERE stripe_payment_intent_id = ${paymentIntentId}
    `) as unknown as [OrderRow | undefined]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/relation .* does not exist/i.test(msg)) return false
    throw err
  }
  if (!order) return false

  if (fullyRefunded || amountRefunded >= order.total_cents) {
    await db`
      UPDATE org_membership_orders SET status = 'refunded', refunded_cents = ${amountRefunded}, refunded_at = NOW()
      WHERE id = ${order.id}
    `
    const assigned = (await db`
      SELECT id FROM org_membership_seats WHERE order_id = ${order.id} AND status = 'assigned'
    `) as unknown as Array<{ id: string }>
    for (const s of assigned) await unassignSeat(order.org_id, s.id, { reason: 'refunded', toStatus: 'refunded' })
    await db`
      UPDATE org_membership_seats SET status = 'refunded', updated_at = NOW()
      WHERE order_id = ${order.id} AND status IN ('unassigned', 'pending_payment')
    `
    return true
  }

  await db`UPDATE org_membership_orders SET refunded_cents = ${amountRefunded} WHERE id = ${order.id}`
  const target = order.unit_cents > 0 ? Math.floor(amountRefunded / order.unit_cents) : 0
  const [{ n: already }] = (await db`
    SELECT COUNT(*)::int AS n FROM org_membership_seats WHERE order_id = ${order.id} AND status = 'refunded'
  `) as unknown as [{ n: number }]
  const need = target - already
  if (need > 0) {
    const done = (await db`
      UPDATE org_membership_seats SET status = 'refunded', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM org_membership_seats WHERE order_id = ${order.id} AND status = 'unassigned'
        ORDER BY created_at DESC, id DESC LIMIT ${need}
      )
      RETURNING id
    `) as unknown as unknown[]
    if (done.length < need) {
      console.error('[org-membership] partial refund exceeds unassigned seats — review manually', {
        orderId: order.id, amountRefunded, seatsRefunded: done.length, seatsWanted: need,
      })
    }
  }
  return true
}

// --- daily lifecycle cron ----------------------------------------------------------------

export interface CronResult {
  orgReminders30: number
  orgReminders7: number
  playerReminders7: number
  expiredSeats: number
  endedEmails: number
  resumed: number
  pausedAtStart: number
  abandonedOrders: number
  releasedStrays: number
}

export async function runMembershipCron(now = new Date()): Promise<CronResult> {
  const out: CronResult = {
    orgReminders30: 0, orgReminders7: 0, playerReminders7: 0, expiredSeats: 0,
    endedEmails: 0, resumed: 0, pausedAtStart: 0, abandonedOrders: 0, releasedStrays: 0,
  }
  const in7 = new Date(now.getTime() + 7 * DAY_MS)
  const in30 = new Date(now.getTime() + 30 * DAY_MS)
  const renewUrl = dashboardUrl()

  await normalizeOrphanSeats()

  // 0. Holders who are on no team of the seat's org any more by a path that
  //    doesn't call releaseSeatIfLeftOrg (a deleted team cascades its
  //    memberships away): their seats go back to the pool.
  const strays = (await db`
    SELECT s.user_id::text AS user_id, s.org_id::text AS org_id
    FROM org_membership_seats s
    WHERE s.status = 'assigned' AND s.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = s.user_id AND t.organization_id = s.org_id
      )
  `) as unknown as Array<{ user_id: string; org_id: string }>
  for (const r of strays) out.releasedStrays += await releaseSeatIfLeftOrg(r.user_id, r.org_id)

  // 1. Org reminders, one per order, at 30 and 7 days out. The 30-day one is
  //    skipped once inside 7 days so a late run never sends both at once.
  for (const days of [30, 7] as const) {
    const col = days === 30 ? 'reminded_30_at' : 'reminded_7_at'
    const lower = days === 30 ? in7 : now
    const upper = days === 30 ? in30 : in7
    const due = (await db`
      SELECT s.order_id, s.org_id, MIN(s.ends_at) AS ends_at, COUNT(*)::int AS seats,
             o.name AS org_name, o.admin_email
      FROM org_membership_seats s
      JOIN organizations o ON o.id = s.org_id
      WHERE s.status IN ('assigned', 'unassigned')
        AND s.ends_at > ${lower} AND s.ends_at <= ${upper}
        AND ${db(col)} IS NULL
      GROUP BY s.order_id, s.org_id, o.name, o.admin_email
    `) as unknown as Array<{ order_id: string; org_id: string; ends_at: Date; seats: number; org_name: string; admin_email: string }>
    for (const r of due) {
      // Claim, send, and un-claim on failure: an overlapping run can't send
      // twice, and a failed send is retried by the next run.
      const claimed = (await db`
        UPDATE org_membership_seats SET ${db(col)} = ${now}
        WHERE order_id = ${r.order_id} AND ${db(col)} IS NULL
        RETURNING id
      `) as unknown as Array<{ id: string }>
      if (claimed.length === 0) continue
      try {
        await sendOrgSeatsExpiringEmail(r.admin_email, {
          orgName: r.org_name, daysLeft: days, seats: r.seats, endsAt: new Date(r.ends_at), renewUrl,
        })
        if (days === 7) await db`UPDATE org_membership_seats SET reminded_30_at = COALESCE(reminded_30_at, ${now}) WHERE order_id = ${r.order_id}`
        if (days === 30) out.orgReminders30++
        else out.orgReminders7++
      } catch (err) {
        console.error('[org-membership cron] org reminder failed, will retry', { orderId: r.order_id, days, err })
        await db`UPDATE org_membership_seats SET ${db(col)} = NULL WHERE order_id = ${r.order_id} AND ${db(col)} = ${now}`
      }
    }
  }

  // 2. Player 7-day notice (web link only). Skipped when another seat of
  //    theirs already starts by the time this one ends (renewed).
  const ending = (await db`
    SELECT s.id, s.org_id, s.plan, s.ends_at, s.user_id, u.email, u.first_name, o.name AS org_name
    FROM org_membership_seats s
    JOIN users u ON u.id = s.user_id
    JOIN organizations o ON o.id = s.org_id
    WHERE s.status = 'assigned' AND s.ends_at > ${now} AND s.ends_at <= ${in7}
      AND s.player_reminded_7_at IS NULL
  `) as unknown as Array<{ id: string; org_id: string; plan: MembershipPlan; ends_at: Date; user_id: string; email: string; first_name: string | null; org_name: string }>
  for (const r of ending) {
    const [claimed] = (await db`
      UPDATE org_membership_seats SET player_reminded_7_at = ${now} WHERE id = ${r.id} AND player_reminded_7_at IS NULL RETURNING id
    `) as unknown as Array<{ id: string }>
    if (!claimed) continue
    // A reminder, not a billing notice: respect unsubscribes (marked done).
    if (await isMarketingSuppressed(r.email)) continue
    try {
      await sendPlayerMembershipEndingEmail(r.email, {
        playerFirstName: (await orgFirstNames(r.user_id, r.org_id)) ?? r.first_name,
        orgName: r.org_name, plan: r.plan, endsAt: new Date(r.ends_at), daysLeft: 7,
      })
      out.playerReminders7++
    } catch (err) {
      console.error('[org-membership cron] player reminder failed, will retry', { seatId: r.id, err })
      await db`UPDATE org_membership_seats SET player_reminded_7_at = NULL WHERE id = ${r.id}`
    }
  }

  // 3. Expire ended seats. Holders get the "ended" note; a paused personal
  //    Stripe plan resumes now (it would also auto-resume at resumes_at).
  const expired = (await db`
    UPDATE org_membership_seats s
    SET status = 'expired', updated_at = NOW()
    WHERE s.status IN ('assigned', 'unassigned') AND s.ends_at <= ${now}
    RETURNING s.id, s.org_id, s.plan, s.ends_at, s.user_id, s.paused_stripe_sub_id, s.ended_email_at
  `) as unknown as Array<{ id: string; org_id: string; plan: MembershipPlan; ends_at: Date; user_id: string | null; paused_stripe_sub_id: string | null; ended_email_at: Date | null }>
  out.expiredSeats = expired.length
  for (const s of expired) {
    if (!s.user_id) continue
    await db`
      UPDATE org_membership_seat_history SET released_at = ${now}, reason = 'expired'
      WHERE seat_id = ${s.id} AND user_id = ${s.user_id} AND released_at IS NULL
    `
    if (s.paused_stripe_sub_id) {
      // paused_stripe_sub_id is the source of truth for "own plan paused"
      // (the player dashboard reads it). Cleared even if the resume call
      // fails: pause_collection.resumes_at was the seat end, so Stripe resumes
      // billing on its own.
      await resumePersonalPlan(s.user_id, s.paused_stripe_sub_id, s.org_id, true)
      await db`UPDATE org_membership_seats SET paused_stripe_sub_id = NULL WHERE id = ${s.id}`
      out.resumed++
    }
    if (!s.ended_email_at) {
      const u = await holder(s.user_id, s.org_id)
      if (u?.email) {
        try {
          await sendPlayerMembershipEndingEmail(u.email, {
            playerFirstName: u.first_name, orgName: await orgName(s.org_id), plan: s.plan,
            endsAt: new Date(s.ends_at), daysLeft: 0,
          })
          await db`UPDATE org_membership_seats SET ended_email_at = ${now} WHERE id = ${s.id}`
          out.endedEmails++
        } catch (err) {
          console.error('[org-membership cron] ended email failed', { seatId: s.id, err })
        }
      }
    }
  }

  // 4. Future-dated seats that have now started: make the pause decision.
  const started = (await db`
    SELECT * FROM org_membership_seats
    WHERE status = 'assigned' AND user_id IS NOT NULL AND starts_at <= ${now} AND ends_at > ${now}
      AND pause_checked_at IS NULL
  `) as unknown as SeatRow[]
  for (const s of started) {
    const r = await applyPersonalPause(s, now)
    if (r?.paused_stripe_sub_id) out.pausedAtStart++
  }

  // 5. Checkouts abandoned for over a day (Stripe sessions expire at 24h):
  //    drop their placeholder seats so they never show as "awaiting payment".
  const abandoned = (await db`
    UPDATE org_membership_orders SET status = 'expired'
    WHERE status = 'pending' AND created_at < ${new Date(now.getTime() - 25 * 3600_000)}
    RETURNING id
  `) as unknown as Array<{ id: string }>
  out.abandonedOrders = abandoned.length
  if (abandoned.length > 0) {
    await db`
      DELETE FROM org_membership_seats
      WHERE status = 'pending_payment' AND order_id = ANY(${abandoned.map((a) => a.id)}::uuid[])
    `
  }
  return out
}

// --- dashboard overview (GET /api/org/memberships) -------------------------------------------

export interface MembershipOverview {
  liveSeats: number
  summary: { bought: number; assigned: number; unassigned: number; expiringIn30: number }
  orders: Array<{
    id: string; plan: MembershipPlan; term: MembershipTerm; seats: number; totalCents: number; currency: string
    status: OrderStatus; startsAt: string; endsAt: string; createdAt: string
    unitCents: number; tier: number
  }>
  seats: Array<{
    id: string; orderId: string; plan: MembershipPlan; term: MembershipTerm; status: SeatStatus
    startsAt: string; endsAt: string
    player: { userId: string; name: string; teamId: string | null; teamName: string | null } | null
  }>
  players: Array<{
    userId: string | null
    /** pending_team_members.id for name-only players (userId null). */
    pendingId?: string
    name: string
    teamId: string
    teamName: string
    email: string | null
    coverage: {
      source: 'org' | 'personal' | 'legacy' | null
      plan: MembershipPlan | null
      endsAt: string | null
      billedVia: 'org' | 'stripe' | 'apple' | 'legacy' | null
      orgName?: string
      /** An assigned seat that starts later. */
      startsAt?: string
    }
    assignable: boolean
    reason?: 'no_account' | 'has_better_plan' | 'already_covered'
    note?: string
    /** The player's own plan, when they pay personally. */
    ownPlan?: { plan: MembershipPlan; billedVia: 'stripe' | 'apple' } | null
    setupIncomplete?: boolean
  }>
}

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null)

export async function getMembershipOverview(orgId: string, now = new Date()): Promise<MembershipOverview> {
  await normalizeOrphanSeats(orgId)
  const orders = (await db`
    SELECT * FROM org_membership_orders WHERE org_id = ${orgId} AND status <> 'expired' ORDER BY created_at DESC
  `) as unknown as OrderRow[]
  const seats = (await db`
    SELECT s.*, u.first_name AS u_first, u.last_initial AS u_last
    FROM org_membership_seats s
    JOIN org_membership_orders o ON o.id = s.order_id AND o.status <> 'expired'
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.org_id = ${orgId}
    ORDER BY s.ends_at DESC, s.created_at, s.id
  `) as unknown as Array<SeatRow & { u_first: string | null; u_last: string | null }>

  const roster = (await db`
    SELECT DISTINCT ON (u.id)
      u.id::text AS user_id, u.email, u.first_name AS u_first, u.last_initial AS u_last, u.roster_pending,
      tm.first_name AS tm_first, tm.last_name_initial AS tm_last, t.id::text AS team_id, t.name AS team_name,
      u.subscription_type, u.subscription_expires_at, u.plan, u.plan_status, u.plan_anchor, u.plan_period_end,
      u.stripe_subscription_id
    FROM team_memberships tm
    JOIN teams t ON t.id = tm.team_id
    JOIN users u ON u.id = tm.user_id
    WHERE t.organization_id = ${orgId}
    ORDER BY u.id, t.name
  `) as unknown as Array<EntitlementUserRow & {
    user_id: string; email: string; u_first: string | null; u_last: string | null; roster_pending: boolean | null
    tm_first: string | null; tm_last: string | null; team_id: string; team_name: string
  }>
  const ids = roster.map((r) => r.user_id)
  const heldSeats = ids.length
    ? ((await db`
        SELECT s.id, s.org_id, o.name AS org_name, s.plan, s.starts_at, s.ends_at, s.anchor_at, s.user_id::text AS user_id
        FROM org_membership_seats s JOIN organizations o ON o.id = s.org_id
        WHERE s.status = 'assigned' AND s.ends_at > ${now} AND s.user_id::text = ANY(${ids}::text[])
        ORDER BY s.starts_at
      `) as unknown as Array<EntitlementSeatRow & { user_id: string }>)
    : []
  const seatsByUser = new Map<string, EntitlementSeatRow[]>()
  for (const s of heldSeats) {
    const list = seatsByUser.get(s.user_id) ?? []
    list.push(s)
    seatsByUser.set(s.user_id, list)
  }

  const nameOf = rosterDisplayName

  const teamByUser = new Map(roster.map((r) => [r.user_id, { teamId: r.team_id, teamName: r.team_name }]))

  // A seat belongs to an account, and siblings can share one account on
  // different teams: name the seat after every roster entry the org has for
  // it ("Liam S. & Harper S."), never users.first_name (whichever child signed
  // up first).
  const rosterNames = (await db`
    SELECT tm.user_id::text AS user_id, tm.first_name, tm.last_name_initial
    FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
    WHERE t.organization_id = ${orgId}
    ORDER BY t.name, tm.first_name
  `) as unknown as Array<{ user_id: string; first_name: string | null; last_name_initial: string | null }>
  const namesByUser = new Map<string, string[]>()
  for (const r of rosterNames) {
    if (!r.first_name?.trim()) continue
    const list = namesByUser.get(r.user_id) ?? []
    const n = nameOf(r.first_name, r.last_name_initial)
    if (!list.some((x) => x.toLowerCase() === n.toLowerCase())) list.push(n)
    namesByUser.set(r.user_id, list)
  }
  const seatHolderName = (userId: string, first: string | null, last: string | null) =>
    namesByUser.get(userId)?.join(' & ') || nameOf(first, last)

  const players: MembershipOverview['players'] = roster.map((r) => {
    const eff = resolveEffectivePlan(r, seatsByUser.get(r.user_id) ?? [], now)
    const covered = eff.source === 'org' || !!eff.upcomingSeat
    let reason: MembershipOverview['players'][number]['reason']
    let note: string | undefined
    if (covered) {
      reason = 'already_covered'
      note = eff.source === 'org' ? `Covered by ${eff.orgName}` : `Seat starts ${iso(eff.upcomingSeat!.startsAt)!.slice(0, 10)}`
    } else if (eff.source === 'legacy') {
      reason = 'has_better_plan'
      note = 'Has unlimited access'
    } else if (eff.personal) {
      note =
        (eff.personal.billedVia === 'apple' ? 'Pays via App Store' : 'Has own plan') +
        ` (${PLAYER_PLANS[eff.personal.plan].name})` +
        (eff.personal.plan === 'pro' ? ' — only a Pro seat can be assigned' : '')
    }
    return {
      userId: r.user_id,
      name: nameOf(r.tm_first || r.u_first, r.tm_last || r.u_last),
      teamId: r.team_id,
      teamName: r.team_name,
      email: r.email,
      coverage: {
        source: eff.source,
        plan: eff.plan ?? (eff.upcomingSeat ? eff.upcomingSeat.plan : null),
        endsAt: iso(eff.source ? eff.endsAt : eff.upcomingSeat?.endsAt ?? null),
        billedVia: eff.billedVia,
        ...(eff.orgName || eff.upcomingSeat ? { orgName: eff.orgName ?? eff.upcomingSeat!.orgName } : {}),
        ...(eff.upcomingSeat && eff.source !== 'org' ? { startsAt: iso(eff.upcomingSeat.startsAt)! } : {}),
      },
      assignable: !reason,
      ...(reason ? { reason } : {}),
      ...(note ? { note } : {}),
      ownPlan: eff.personal ? { plan: eff.personal.plan, billedVia: eff.personal.billedVia } : null,
      setupIncomplete: !!r.roster_pending,
    }
  })

  let pendingRows: Array<{ id: string; first_name: string; last_name_initial: string | null; contact_email: string | null; team_id: string; team_name: string }> = []
  try {
    pendingRows = (await db`
      SELECT p.id::text AS id, p.first_name, p.last_name_initial, p.contact_email, t.id::text AS team_id, t.name AS team_name
      FROM pending_team_members p JOIN teams t ON t.id = p.team_id
      WHERE t.organization_id = ${orgId}
    `) as unknown as typeof pendingRows
  } catch {
    // older schema without contact_email — name-only players are simply omitted
  }
  for (const p of pendingRows) {
    players.push({
      userId: null,
      pendingId: p.id,
      name: nameOf(p.first_name, p.last_name_initial),
      teamId: p.team_id,
      teamName: p.team_name,
      email: p.contact_email,
      coverage: { source: null, plan: null, endsAt: null, billedVia: null },
      assignable: false,
      reason: 'no_account',
      note: 'Add an email to assign',
      ownPlan: null,
    })
  }
  players.sort((a, b) => a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name))

  const paidOrderIds = new Set(orders.filter((o) => o.status === 'paid').map((o) => o.id))
  const liveSeatRows = seats.filter(
    (s) => paidOrderIds.has(s.order_id) && (s.status === 'assigned' || s.status === 'unassigned') && new Date(s.ends_at) > now,
  )
  const in30 = now.getTime() + 30 * DAY_MS

  return {
    liveSeats: liveSeatRows.length,
    summary: {
      bought: liveSeatRows.length,
      assigned: liveSeatRows.filter((s) => s.status === 'assigned').length,
      unassigned: liveSeatRows.filter((s) => s.status === 'unassigned').length,
      expiringIn30: liveSeatRows.filter((s) => new Date(s.ends_at).getTime() <= in30).length,
    },
    orders: orders.map((o) => ({
      id: o.id, plan: o.plan, term: o.term, seats: o.seats, totalCents: o.total_cents, currency: o.currency,
      status: o.status, startsAt: iso(o.starts_at)!, endsAt: iso(o.ends_at)!, createdAt: iso(o.created_at)!,
      unitCents: o.unit_cents, tier: o.tier,
    })),
    seats: seats.map((s) => ({
      id: s.id, orderId: s.order_id, plan: s.plan, term: s.term, status: s.status,
      startsAt: iso(s.starts_at)!, endsAt: iso(s.ends_at)!,
      player: s.user_id
        ? {
            userId: s.user_id,
            name: seatHolderName(s.user_id, s.u_first, s.u_last),
            teamId: teamByUser.get(s.user_id)?.teamId ?? null,
            teamName: teamByUser.get(s.user_id)?.teamName ?? null,
          }
        : null,
    })),
    players,
  }
}
