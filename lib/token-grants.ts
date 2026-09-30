import type Stripe from 'stripe'
import { db } from './db'
import { claimStripeSession, releaseStripeSessionClaim } from './stripe-idempotency'
import { recordPurchase } from './record-purchase'

/**
 * Player token grants bought by an org or a coach (/api/{org,team}/buy-player-tokens).
 *
 * The recipients used to ride in Stripe metadata as a comma-joined id list.
 * Stripe caps a metadata value at 500 characters and a uuid is 36, so
 * checkout failed outright at 14 players. The list now lives here, keyed by a
 * row id, and the metadata carries only { type, grantId, tokensEach, buyer }.
 */

export const MAX_GRANT_RECIPIENTS = 500

export async function createPendingTokenGrant(input: {
  buyerKind: 'org' | 'team'
  buyerRef: string
  recipientUserIds: string[]
  tokensEach: number
}): Promise<string> {
  const [row] = (await db`
    INSERT INTO pending_token_grants (buyer_kind, buyer_ref, recipient_user_ids, tokens_each)
    VALUES (${input.buyerKind}, ${input.buyerRef}, ${input.recipientUserIds}::uuid[], ${input.tokensEach})
    RETURNING id
  `) as unknown as [{ id: string }]
  return row.id
}

export async function attachGrantSession(grantId: string, sessionId: string): Promise<void> {
  await db`UPDATE pending_token_grants SET stripe_session_id = ${sessionId} WHERE id = ${grantId}`
}

export async function deletePendingTokenGrant(grantId: string): Promise<void> {
  await db`DELETE FROM pending_token_grants WHERE id = ${grantId} AND fulfilled_at IS NULL`
}

export type GrantOutcome = 'granted' | 'already_processed' | 'unknown_grant' | 'failed'

/**
 * Credit every recipient in ONE transaction (the legacy loop could leave a
 * grant half-applied). Idempotent via claimStripeSession + fulfilled_at.
 */
export async function fulfillTokenGrant(session: Stripe.Checkout.Session): Promise<GrantOutcome> {
  const grantId = session.metadata?.grantId
  if (!grantId || !/^[0-9a-f-]{36}$/i.test(grantId)) return 'unknown_grant'
  const [grant] = (await db`
    SELECT id, buyer_kind, buyer_ref, recipient_user_ids, tokens_each, stripe_session_id, fulfilled_at
    FROM pending_token_grants WHERE id = ${grantId}
  `) as unknown as [
    | { id: string; buyer_kind: string; buyer_ref: string; recipient_user_ids: string[]; tokens_each: number; stripe_session_id: string | null; fulfilled_at: Date | null }
    | undefined,
  ]
  if (!grant) return 'unknown_grant'
  if (grant.stripe_session_id && grant.stripe_session_id !== session.id) return 'unknown_grant'
  if (grant.fulfilled_at) return 'already_processed'

  const recipients = grant.recipient_user_ids ?? []
  const total = recipients.length * grant.tokens_each
  const claim = await claimStripeSession(session.id, total, `users:${recipients.length}`)
  if (claim === 'already_processed') return 'already_processed'
  try {
    const applied = (await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db
      const [mark] = (await sql`
        UPDATE pending_token_grants SET fulfilled_at = NOW(), stripe_session_id = COALESCE(stripe_session_id, ${session.id})
        WHERE id = ${grantId} AND fulfilled_at IS NULL
        RETURNING id
      `) as unknown as [{ id: string } | undefined]
      if (!mark) return false
      await sql`
        UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${grant.tokens_each}
        WHERE id = ANY(${recipients}::uuid[])
      `
      return true
    })) as boolean
    if (!applied) return 'already_processed'
  } catch (err) {
    console.error('[token-grants] grant failed, releasing claim:', session.id, err)
    if (claim === 'claimed') await releaseStripeSessionClaim(session.id, 'team_token_grant_failed')
    return 'failed'
  }
  await recordPurchase(session, {
    kind: 'player_tokens',
    description: `${grant.tokens_each} token${grant.tokens_each === 1 ? '' : 's'} each to ${recipients.length} player${recipients.length === 1 ? '' : 's'}`,
    quantity: total,
    buyerKind: grant.buyer_kind === 'org' ? 'org' : 'team',
    buyerRef: grant.buyer_ref,
  })
  return 'granted'
}
