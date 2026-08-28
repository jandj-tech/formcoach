import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { grantFreeOrgTokensIfEligible } from '@/lib/team-tokens'
import { addToEmailList } from '@/lib/email-list'
import { sendMetaEvent, makeRegistrationEvent } from '@/lib/meta-server'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitByIp } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { checkEmailAbuse } from '@/lib/email-abuse'

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'signup', 10, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { email, password, nickname, teamInviteToken, claimToken, website, turnstileToken } =
      await req.json()

    // Honeypot: a field hidden from real visitors. Bots fill every input they
    // find. Answer with a plain success so the operator cannot tell their
    // submission was dropped and start probing for the reason.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ success: true })
    }

    const captcha = await verifyTurnstile(req, turnstileToken)
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 })
    }

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Email and password (6+ chars) required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    const existing = await db`SELECT id FROM users WHERE email = ${emailLower}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Account already exists. Please log in.' }, { status: 409 })
    }

    // Signing up enrols the address in the marketing list, so an unverified
    // signup is a way to mail a stranger. Alias variants of one Gmail inbox
    // are the same account and must not each claim their own.
    const abuse = await checkEmailAbuse(emailLower, 'users')
    if (!abuse.ok) {
      return NextResponse.json({ error: abuse.error }, { status: 409 })
    }

    // Signup is open to anyone. If this email already has subscription state
    // (e.g. a legacy subscriber), carry it over — but it is not required.
    const [sub] = await db`
      SELECT subscription_type, subscription_expires_at
      FROM email_list
      WHERE email = ${emailLower}
    `

    const hash = await bcrypt.hash(password, BCRYPT_COST)

    const nicknameTrimmed = nickname?.trim() || null

    // free_analysis_used = true: the free signup analysis has been
    // discontinued, so new accounts start with no free upload.
    const [user] = await db`
      INSERT INTO users (email, password_hash, subscription_type, subscription_expires_at, nickname, free_analysis_used)
      VALUES (${emailLower}, ${hash}, ${sub?.subscription_type ?? null}, ${sub?.subscription_expires_at ?? null}, ${nicknameTrimmed}, true)
      RETURNING id, email
    ` as unknown as [{ id: string; email: string }]

    // Link any existing anonymous submissions for this email
    await db`UPDATE submissions SET user_id = ${user.id} WHERE email = ${emailLower} AND user_id IS NULL`

    // New accounts join the marketing list (they can unsubscribe any time;
    // a prior unsubscribe is preserved).
    await addToEmailList(emailLower)

    // Redeem a one-time claim token from a ball purchase (token is independent
    // of email). Consume-and-grant in one statement so a concurrent redemption
    // (double submit, webhook auto-credit) can never grant twice.
    if (claimToken) {
      try {
        await db`
          WITH claim AS (
            UPDATE pending_credit_claims SET redeemed_at = NOW()
            WHERE claim_token = ${claimToken} AND redeemed_at IS NULL AND tokens_to_grant > 0
            RETURNING tokens_to_grant
          )
          UPDATE users
          SET analysis_tokens = COALESCE(analysis_tokens, 0) + (SELECT tokens_to_grant FROM claim)
          WHERE id = ${user.id} AND EXISTS (SELECT 1 FROM claim)
        `
      } catch {
        // Non-fatal
      }
    }

    // If they registered via a coach invite link, claim their pending team spot
    if (teamInviteToken) {
      try {
        const [pending] = await db`
          SELECT id, team_id, first_name, last_name_initial
          FROM pending_team_members WHERE invite_token = ${teamInviteToken}
        ` as unknown as [{ id: string; team_id: string; first_name: string; last_name_initial: string | null } | undefined]
        if (pending) {
          await db`
            INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
            VALUES (${user.id}, ${pending.team_id}, ${pending.first_name}, ${pending.last_name_initial})
            ON CONFLICT (user_id, team_id) DO UPDATE
              SET first_name = EXCLUDED.first_name, last_name_initial = EXCLUDED.last_name_initial
          `
          await db`DELETE FROM pending_team_members WHERE id = ${pending.id}`
          await grantFreeOrgTokensIfEligible(pending.team_id)
        }
      } catch {
        // Non-fatal: still create the account even if invite claim fails
      }
    }

    // Fire server-side Meta CAPI event (deduplicates with client-side pixel).
    // Skipped for signups made inside the iOS app — Apple's ATT rules forbid
    // tracking app users without authorization, and the app never asks.
    const signupUA = req.headers.get('user-agent') ?? ''
    if (!signupUA.includes('LearnHoopsApp')) {
      await sendMetaEvent(makeRegistrationEvent({
        email: emailLower,
        ip: req.headers.get('x-forwarded-for') ?? undefined,
        userAgent: signupUA || undefined,
        url: 'https://www.learnhoops.com/signup',
      }))
    }

    const token = await signSession({ userId: user.id, email: user.email })
    const res = NextResponse.json({ success: true, token })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
