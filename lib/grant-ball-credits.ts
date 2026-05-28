import { db } from '@/lib/db'

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
  let claimedThisCall = false
  try {
    const claimed = await db`
      INSERT INTO processed_stripe_sessions (session_id, tokens_granted, recipient)
      VALUES (${sessionId}, ${tokensToGrant}, ${recipient || null})
      ON CONFLICT (session_id) DO NOTHING
      RETURNING session_id
    ` as unknown as Array<{ session_id: string }>
    if (claimed.length === 0) {
      console.log('[grantBallCreditsOnce] already processed', { sessionId })
      return { granted: false, reason: 'already_processed' }
    }
    claimedThisCall = true
  } catch (err) {
    console.warn('[grantBallCreditsOnce] processed_stripe_sessions unavailable, proceeding without idempotency lock', err)
  }

  // Helper: release the claim row if we end up not crediting anyone,
  // so a retry has a chance to actually land.
  async function releaseClaim(label: string) {
    if (!claimedThisCall) return
    try {
      await db`DELETE FROM processed_stripe_sessions WHERE session_id = ${sessionId}`
      console.warn('[grantBallCreditsOnce] released claim', { sessionId, label })
    } catch (err) {
      console.error('[grantBallCreditsOnce] failed to release claim:', err)
    }
  }

  let updatedRows = 0
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
      // Stale user_id fallback: try email.
      if (updatedRows === 0 && emailLower) {
        const byEmail = await db`
          UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensToGrant}
          WHERE LOWER(email) = ${emailLower}
          RETURNING id
        ` as unknown as Array<{ id: string }>
        updatedRows = byEmail.length
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
      // Guest / legacy: credit the user record by email and seed email_list
      // so signup later picks up the credits.
      await db`
        INSERT INTO email_list (email, analysis_tokens)
        VALUES (${emailLower}, ${tokensToGrant})
        ON CONFLICT (email) DO UPDATE
        SET analysis_tokens = COALESCE(email_list.analysis_tokens, 0) + ${tokensToGrant}
      `
      const rows = await db`
        UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensToGrant}
        WHERE LOWER(email) = ${emailLower}
        RETURNING id
      ` as unknown as Array<{ id: string }>
      updatedRows = rows.length
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

  console.log('[grantBallCreditsOnce] granted', { sessionId, recipient, emailLower, tokensToGrant, updatedRows })
  return { granted: true, reason: 'granted', updatedRows }
}
