import type Stripe from 'stripe'
import { db } from '@/lib/db'
import { addToEmailList } from '@/lib/email-list'
import { generateUniqueAccessCode } from '@/lib/access-code'
import { recordPurchase } from '@/lib/record-purchase'
import { claimStripeSession, releaseStripeSessionClaim } from '@/lib/stripe-idempotency'
import { stripeIdOf } from '@/lib/org-subscription'
import {
  consumePendingOrgSignup,
  getPendingByToken,
  organizationForPendingToken,
} from '@/lib/pending-org'
import { isOrgPlan } from '@/lib/org-subscription-pricing'

export interface CreatedOrg {
  orgId: string
  adminEmail: string
  orgName: string
  /** False when the org already existed — a webhook redelivery or a page refresh. */
  created: boolean
}

/**
 * Turn a paid subscription checkout into an organization. Exactly once.
 *
 * Two callers race by design: the Stripe webhook, and the success route the
 * buyer lands on. Whichever arrives first creates the org; the other finds it
 * already made and returns it, so the buyer is logged in either way and a
 * missed webhook never strands someone who has paid.
 *
 * Single-use is enforced twice over: `claimStripeSession` gates on the Stripe
 * session id, and `consumePendingOrgSignup` gates on `consumed_at IS NULL`.
 * Returns null only when the session genuinely does not correspond to a
 * pending signup.
 */
export async function createOrgFromCheckout(
  session: Stripe.Checkout.Session,
): Promise<CreatedOrg | null> {
  const token = session.metadata?.pendingToken
  if (!token) {
    console.error('[create-org] session has no pendingToken', session.id)
    return null
  }

  // Already built on an earlier delivery — hand back the same org.
  const existing = await organizationForPendingToken(token)
  if (existing) {
    const [org] = (await db`
      SELECT name FROM organizations WHERE id = ${existing.organizationId}
    `) as unknown as [{ name: string } | undefined]
    return {
      orgId: existing.organizationId,
      adminEmail: existing.adminEmail,
      orgName: org?.name ?? '',
      created: false,
    }
  }

  const pending = await getPendingByToken(token)
  if (!pending) {
    console.error('[create-org] no unconsumed pending signup for token', session.id)
    return null
  }

  const claim = await claimStripeSession(session.id, 0, `pending:${token}`)
  if (claim === 'already_processed') {
    // Another caller is mid-flight. Re-read rather than building a second org.
    const after = await organizationForPendingToken(token)
    if (!after) return null
    return { orgId: after.organizationId, adminEmail: after.adminEmail, orgName: pending.orgName, created: false }
  }

  const planMeta = session.metadata?.plan
  const plan = isOrgPlan(planMeta) ? planMeta : null
  const customerId = stripeIdOf(session.customer as string | { id: string } | null)
  const subscriptionId = stripeIdOf(session.subscription as string | { id: string } | null)

  try {
    const accessCode = await generateUniqueAccessCode()

    const [org] = (await db`
      INSERT INTO organizations (
        name, admin_email, password_hash, access_code,
        stripe_customer_id, stripe_subscription_id,
        subscription_status, subscription_plan
      )
      VALUES (
        ${pending.orgName}, ${pending.adminEmail}, ${pending.passwordHash}, ${accessCode},
        ${customerId}, ${subscriptionId},
        'active', ${plan}
      )
      RETURNING id, name
    `) as unknown as [{ id: string; name: string }]

    // Marks the signup used and points it at the org, which is also how a
    // redelivery finds its way back here instead of creating a duplicate.
    await consumePendingOrgSignup(token, org.id)

    // Everything below is best-effort. None of it may release the claim or
    // throw: the organization exists and the money has moved.
    await addToEmailList(pending.adminEmail).catch((err) =>
      console.error('[create-org] email list add failed:', err),
    )
    await recordPurchase(session, {
      kind: 'org_subscription',
      description: `LearnHoops Organization — ${plan === 'annual' ? 'Annual' : 'Monthly'}`,
      quantity: 1,
      email: pending.adminEmail,
      buyerKind: 'org',
      buyerRef: org.id,
    })

    console.log('[create-org] organization created', {
      orgId: org.id,
      plan,
      sessionId: session.id,
    })

    return { orgId: org.id, adminEmail: pending.adminEmail, orgName: org.name, created: true }
  } catch (err) {
    console.error('[create-org] failed to create organization:', err)
    // Let Stripe's redelivery — or the success route — try again.
    if (claim === 'claimed') await releaseStripeSessionClaim(session.id, 'org_subscription_failed')
    return null
  }
}
