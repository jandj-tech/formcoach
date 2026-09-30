import type Stripe from 'stripe'
import { getStripe } from './stripe'
import { resolveBaseUrl } from './base-url'

/**
 * The only Stripe surface the org-membership and player-token-grant code
 * touches, behind one small adapter so it can be exercised without the
 * network:
 *
 *   - Production (and any real key): straight through to the shared client
 *     from lib/stripe.ts.
 *   - The local QA harness (NODE_ENV !== 'production' AND the literal mock key
 *     `sk_test_local_mock`): a deterministic in-process double. No request
 *     ever leaves the machine — the mock key would only earn a 401 from
 *     api.stripe.com anyway, and nothing here may call real Stripe.
 *   - Unit tests: setMembershipStripeForTests(fake).
 *
 * The double enforces Stripe's metadata limits (50 keys, 40-char keys,
 * 500-char values) so a test can prove an order carries no player ids.
 */

export interface CheckoutLike {
  id: string
  url: string | null
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  status: 'open' | 'complete' | 'expired' | null
  metadata: Record<string, string> | null
  amount_total: number | null
  currency: string | null
  payment_intent: string | null
  customer_email?: string | null
  customer_details?: { email?: string | null; name?: string | null } | null
}

export interface MembershipStripe {
  createCheckout(params: Stripe.Checkout.SessionCreateParams): Promise<{ id: string; url: string | null }>
  retrieveCheckout(sessionId: string): Promise<CheckoutLike>
  /** Stop billing a personal subscription until `resumesAt` (pause_collection, behavior 'void'). */
  pauseSubscription(subscriptionId: string, resumesAt: Date): Promise<void>
  /** Clear pause_collection so billing resumes now. */
  resumeSubscription(subscriptionId: string): Promise<void>
}

const LOCAL_MOCK_KEY = 'sk_test_local_mock'

export function isLocalStripeDouble(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.STRIPE_SECRET_KEY === LOCAL_MOCK_KEY
}

export function assertStripeMetadataLimits(metadata: Record<string, unknown> | undefined | null): void {
  if (!metadata) return
  const keys = Object.keys(metadata)
  if (keys.length > 50) throw new Error('Stripe metadata: more than 50 keys')
  for (const k of keys) {
    if (k.length > 40) throw new Error(`Stripe metadata: key "${k}" longer than 40 characters`)
    const v = String(metadata[k] ?? '')
    if (v.length > 500) throw new Error(`Stripe metadata: value for "${k}" longer than 500 characters`)
  }
}

/** Every Stripe call the double saw, for tests and local QA logs. */
export const localStripeCalls: Array<{ op: string; args: unknown }> = []

/**
 * The local double. Session ids are `cs_local_<type>_<ref>_<rand>` so a
 * later retrieve can rebuild the metadata without shared state (Next dev can
 * load a module once per route bundle, so an in-memory map would not be seen
 * by the /complete route).
 */
const localDouble: MembershipStripe = {
  async createCheckout(params) {
    assertStripeMetadataLimits(params.metadata as Record<string, unknown> | undefined)
    localStripeCalls.push({ op: 'checkout.create', args: params })
    const meta = (params.metadata ?? {}) as Record<string, string>
    const ref = meta.orderId ?? meta.grantId ?? 'x'
    const id = `cs_local_${meta.type ?? 'unknown'}__${ref}__${Math.random().toString(36).slice(2, 10)}`
    const success = typeof params.success_url === 'string' ? params.success_url : `${resolveBaseUrl()}/`
    return { id, url: success.replace('{CHECKOUT_SESSION_ID}', id) }
  },
  async retrieveCheckout(sessionId) {
    localStripeCalls.push({ op: 'checkout.retrieve', args: sessionId })
    const m = /^cs_local_(.+?)__(.+?)__[a-z0-9]+$/.exec(sessionId)
    if (!m) throw new Error('No such checkout session')
    const [, type, ref] = m
    const metadata: Record<string, string> =
      type === 'org_membership_purchase' ? { type, orderId: ref } : { type, grantId: ref }
    return {
      id: sessionId,
      url: null,
      payment_status: 'paid',
      status: 'complete',
      metadata,
      amount_total: null,
      currency: null,
      payment_intent: `pi_local_${ref}`,
      customer_details: null,
    }
  },
  async pauseSubscription(subscriptionId, resumesAt) {
    localStripeCalls.push({ op: 'subscription.pause', args: { subscriptionId, resumesAt } })
  },
  async resumeSubscription(subscriptionId) {
    localStripeCalls.push({ op: 'subscription.resume', args: { subscriptionId } })
  },
}

const liveStripe: MembershipStripe = {
  async createCheckout(params) {
    assertStripeMetadataLimits(params.metadata as Record<string, unknown> | undefined)
    const s = await getStripe().checkout.sessions.create(params)
    return { id: s.id, url: s.url }
  },
  async retrieveCheckout(sessionId) {
    const s = await getStripe().checkout.sessions.retrieve(sessionId)
    return {
      id: s.id,
      url: s.url,
      payment_status: s.payment_status,
      status: s.status,
      metadata: (s.metadata ?? null) as Record<string, string> | null,
      amount_total: s.amount_total,
      currency: s.currency,
      payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null,
      customer_email: s.customer_email,
      customer_details: s.customer_details ? { email: s.customer_details.email, name: s.customer_details.name } : null,
    }
  },
  async pauseSubscription(subscriptionId, resumesAt) {
    await getStripe().subscriptions.update(subscriptionId, {
      pause_collection: { behavior: 'void', resumes_at: Math.floor(resumesAt.getTime() / 1000) },
    })
  },
  async resumeSubscription(subscriptionId) {
    await getStripe().subscriptions.update(subscriptionId, { pause_collection: '' })
  },
}

let override: MembershipStripe | null = null

/** Unit tests only: swap the adapter (null restores the default). */
export function setMembershipStripeForTests(fake: MembershipStripe | null): void {
  override = fake
}

export function membershipStripe(): MembershipStripe {
  if (override) return override
  return isLocalStripeDouble() ? localDouble : liveStripe
}
