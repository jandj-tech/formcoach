import { db } from '@/lib/db'

export type StripeSessionClaim = 'claimed' | 'already_processed' | 'no_lock'

// Claim a Stripe checkout session before granting whatever it purchased.
// Stripe does not guarantee at-most-once webhook delivery, so every grant
// (tokens, credits, initiation) must pass through this gate: the first
// caller's INSERT wins, redeliveries see the conflict and no-op.
//
// Returns 'no_lock' if the processed_stripe_sessions table doesn't exist yet
// (migration not run) — callers proceed best-effort so credits aren't
// silently dropped, matching the pre-existing grant-ball-credits behavior.
export async function claimStripeSession(
  sessionId: string,
  tokensGranted: number,
  recipient: string | null
): Promise<StripeSessionClaim> {
  try {
    const rows = (await db`
      INSERT INTO processed_stripe_sessions (session_id, tokens_granted, recipient)
      VALUES (${sessionId}, ${tokensGranted}, ${recipient})
      ON CONFLICT (session_id) DO NOTHING
      RETURNING session_id
    `) as unknown as Array<{ session_id: string }>
    return rows.length > 0 ? 'claimed' : 'already_processed'
  } catch (err) {
    console.warn(
      '[stripe] processed_stripe_sessions unavailable, proceeding without idempotency lock',
      err
    )
    return 'no_lock'
  }
}

// Release a claim when the grant itself failed, so a Stripe redelivery (or
// the success-page safety net) gets another chance to actually land it.
export async function releaseStripeSessionClaim(sessionId: string, label: string): Promise<void> {
  try {
    await db`DELETE FROM processed_stripe_sessions WHERE session_id = ${sessionId}`
    console.warn('[stripe] released session claim', { sessionId, label })
  } catch (err) {
    console.error('[stripe] failed to release session claim:', err)
  }
}
