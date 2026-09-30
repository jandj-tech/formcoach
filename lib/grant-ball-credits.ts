import { db } from '@/lib/db'
import { claimStripeSession, releaseStripeSessionClaim } from '@/lib/stripe-idempotency'
import { createPendingCreditClaim, playersByEmail, soleVerifiedPlayer } from '@/lib/player-accounts'
import { sendClaimCreditsEmail } from '@/lib/email'

export interface GrantBallCreditsInput {
  sessionId: string
  // "user:<id>"   credits users.analysis_tokens (player)
  // "coach:<email>" credits coach_credits.credits (team coach personal pool)
  // "org:<id>"    credits organizations.token_balance (org owner pool)
  // "team:<id>"   legacy — credits teams.token_pool (kept for old sessions)
  // ""            guest/email — credits by email match + email_list
  recipient: string
  tokensToGrant: number
  email: string | null
}

export interface GrantBallCreditsResult {
  granted: boolean
  reason: 'no_tokens' | 'already_processed' | 'no_recipient_no_email' | 'no_match' | 'grant_failed' | 'granted'
  updatedRows?: number
  /**
   * Set when several verified player accounts share the address, so the
   * credits could not go to exactly one: they wait on this one-time claim and
   * the claim link was emailed to the address.
   */
  heldClaimToken?: string
}

// Idempotently grant the free shot-analysis credits attached to a Stripe
// session. The first caller (webhook or success-page safety net) wins via
// the processed_stripe_sessions table; subsequent calls no-op so a buyer
// never gets credited twice.
export async function grantBallCreditsOnce(input: GrantBallCreditsInput): Promise<GrantBallCreditsResult> {
  const { sessionId, recipient, tokensToGrant, email } = input
  if (tokensToGrant <= 0) return { granted: false, reason: 'no_tokens' }

  const emailLower = (email ?? '').toLowerCase()

  if (!recipient && !emailLower) {
    return { granted: false, reason: 'no_recipient_no_email' }
  }

  // Claim the session — insert wins, conflict means another caller already
  // processed it. Until the migration runs, fall through to the grant logic
  // (best-effort) so we don't silently drop credits on a missing table.
  const claim = await claimStripeSession(sessionId, tokensToGrant, recipient || null)
  if (claim === 'already_processed') {
    console.log('[grantBallCreditsOnce] already processed', { sessionId })
    return { granted: false, reason: 'already_processed' }
  }

  // Helper: release the claim row if we end up not crediting anyone,
  // so a retry has a chance to actually land.
  async function releaseClaim(label: string) {
    if (claim !== 'claimed') return
    await releaseStripeSessionClaim(sessionId, label)
  }

  let updatedRows = 0
  let heldClaimToken: string | undefined

  // The address alone names the buyer here, and several player accounts may
  // share it (siblings on a parent's inbox). Credit EXACTLY ONE: the single
  // account that has proven the inbox. With several verified accounts the
  // credits wait on a claim whose emailed link lets the family pick one (by
  // logging in to it); with none, the caller's no-account fallback applies.
  async function creditSoleVerifiedByEmail(): Promise<'credited' | 'held' | 'none'> {
    const target = await soleVerifiedPlayer(emailLower)
    if (target) {
      const rows = await db`
        UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensToGrant}
        WHERE id = ${target.id}
        RETURNING id
      ` as unknown as Array<{ id: string }>
      return rows.length > 0 ? 'credited' : 'none'
    }
    const verified = (await playersByEmail(emailLower)).filter((a) => !!a.email_verified_at)
    if (verified.length < 2) return 'none'
    heldClaimToken = await createPendingCreditClaim(tokensToGrant)
    try {
      await sendClaimCreditsEmail(emailLower, null, tokensToGrant, heldClaimToken, { choose: true })
    } catch (err) {
      console.error('[grantBallCreditsOnce] claim email failed (claim still redeemable):', { sessionId, heldClaimToken }, err)
    }
    return 'held'
  }

  try {
    if (recipient.startsWith('coach:')) {
      const coachEmail = recipient.slice(6).toLowerCase()
      const rows = await db`
        INSERT INTO coach_credits (email, credits)
        VALUES (${coachEmail}, ${tokensToGrant})
        ON CONFLICT (email) DO UPDATE
        SET credits = COALESCE(coach_credits.credits, 0) + ${tokensToGrant}
        RETURNING email
      ` as unknown as Array<{ email: string }>
      updatedRows = rows.length
    } else if (recipient.startsWith('org:')) {
      const orgId = recipient.slice(4)
      const rows = await db`
        UPDATE organizations SET token_balance = COALESCE(token_balance, 0) + ${tokensToGrant}
        WHERE id = ${orgId}
        RETURNING id
      ` as unknown as Array<{ id: string }>
      updatedRows = rows.length
    } else if (recipient.startsWith('team:')) {
      // Legacy — only hit by pre-deploy sessions still being processed.
      const teamId = recipient.slice(5)
      const rows = await db`
        UPDATE teams SET token_pool = COALESCE(token_pool, 0) + ${tokensToGrant}
        WHERE id = ${teamId}
        RETURNING id
      ` as unknown as Array<{ id: string }>
      updatedRows = rows.length
    } else if (recipient.startsWith('user:')) {
      const userId = recipient.slice(5)
      const rows = await db`
        UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensToGrant}
        WHERE id = ${userId}
        RETURNING id
      ` as unknown as Array<{ id: string }>
      updatedRows = rows.length
      // Stale user_id fallback: try email — but only an account that has
      // proven it owns that inbox (anyone can register any address), and only
      // ONE (siblings may share it — see creditSoleVerifiedByEmail).
      if (updatedRows === 0 && emailLower) {
        const out = await creditSoleVerifiedByEmail()
        updatedRows = out === 'none' ? 0 : 1
      }
      if (emailLower) {
        await db`
          INSERT INTO email_list (email, analysis_tokens)
          VALUES (${emailLower}, ${tokensToGrant})
          ON CONFLICT (email) DO UPDATE
          SET analysis_tokens = COALESCE(email_list.analysis_tokens, 0) + ${tokensToGrant}
        `
      }
    } else if (emailLower) {
      // Guest / legacy: credit the user account for this email — only one that
      // has proven it owns the inbox (email_verified_at); an address match
      // alone would hand the buyer's credits to whoever registered it. Only
      // when there is no such account do the credits park on email_list (the
      // anonymous analyze-by-email flow spends from there). Crediting both —
      // as this used to — handed the buyer the tokens twice.
      //
      // Exactly one account (creditSoleVerifiedByEmail): several verified
      // siblings on the address hold the credits on an emailed claim instead.
      const out = await creditSoleVerifiedByEmail()
      updatedRows = out === 'none' ? 0 : 1
      if (out === 'none') {
        await db`
          INSERT INTO email_list (email, analysis_tokens)
          VALUES (${emailLower}, ${tokensToGrant})
          ON CONFLICT (email) DO UPDATE
          SET analysis_tokens = COALESCE(email_list.analysis_tokens, 0) + ${tokensToGrant}
        `
        // The email_list write IS the grant here — count it so the session
        // claim is kept. Releasing it (the old behavior) let every webhook
        // redelivery pile more tokens onto email_list.
        updatedRows = 1
      }
    }
  } catch (err) {
    console.error('[grantBallCreditsOnce] grant failed:', err)
    await releaseClaim('grant_failed')
    return { granted: false, reason: 'grant_failed', updatedRows: 0 }
  }

  if (updatedRows === 0) {
    console.error('[grantBallCreditsOnce] grant matched nothing', {
      sessionId, recipient, emailLower, tokensToGrant,
    })
    await releaseClaim('no_match')
    return { granted: false, reason: 'no_match', updatedRows: 0 }
  }

  console.log('[grantBallCreditsOnce] granted', { sessionId, recipient, emailLower, tokensToGrant, updatedRows, heldClaimToken })
  return { granted: true, reason: 'granted', updatedRows, ...(heldClaimToken ? { heldClaimToken } : {}) }
}
