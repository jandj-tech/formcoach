import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { clearOtherSessions, PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE } from '@/lib/sessions'
import { rateLimitByIp } from '@/lib/rate-limit'

// Redeem a one-time ball-purchase claim token into a player's account.
// Used when a logged-out existing customer buys a ball, lands on signup,
// is told the account exists, and logs in instead — the claim carries over.
async function redeemClaim(claimToken: string | undefined, userId: string) {
  if (!claimToken) return
  try {
    // Consume-and-grant in one statement so a concurrent redemption (double
    // submit, or the webhook auto-crediting an existing account) can never
    // grant the same claim twice.
    await db`
      WITH claim AS (
        UPDATE pending_credit_claims SET redeemed_at = NOW()
        WHERE claim_token = ${claimToken} AND redeemed_at IS NULL AND tokens_to_grant > 0
        RETURNING tokens_to_grant
      )
      UPDATE users
      SET analysis_tokens = COALESCE(analysis_tokens, 0) + (SELECT tokens_to_grant FROM claim)
      WHERE id = ${userId} AND EXISTS (SELECT 1 FROM claim)
    `
  } catch {
    // Non-fatal — login still succeeds.
  }
}

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'login', 10, 900)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { email, password, claimToken } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // 1. Organization account
    const [org] = (await db`
      SELECT id, admin_email, password_hash FROM organizations WHERE admin_email = ${emailLower}
    `) as unknown as [{ id: string; admin_email: string; password_hash: string } | undefined]
    if (org?.password_hash && (await bcrypt.compare(password, org.password_hash))) {
      const token = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email })
      const res = NextResponse.json({ success: true, redirect: '/org/dashboard' })
      res.cookies.set(orgSessionCookieOptions(token))
      clearOtherSessions(res, ORG_COOKIE)
      return res
    }

    // 2. Team founding coach
    const teams = (await db`
      SELECT id, admin_email, password_hash, name FROM teams
      WHERE admin_email = ${emailLower} AND password_hash IS NOT NULL
    `) as unknown as Array<{ id: string; admin_email: string; password_hash: string; name: string }>
    if (teams.length > 0 && (await bcrypt.compare(password, teams[0].password_hash))) {
      if (teams.length > 1) {
        return NextResponse.json({
          multipleTeams: true,
          teams: teams.map(t => ({ id: t.id, name: t.name })),
        })
      }
      const team = teams[0]
      const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
      const res = NextResponse.json({ success: true, redirect: '/team/dashboard' })
      res.cookies.set(teamSessionCookieOptions(token))
      clearOtherSessions(res, TEAM_COOKIE)
      return res
    }

    // 3. Additional team coach (team_coaches)
    try {
      const [coach] = (await db`
        SELECT team_id, email, password_hash FROM team_coaches
        WHERE email = ${emailLower} AND password_hash IS NOT NULL
      `) as unknown as [{ team_id: string; email: string; password_hash: string } | undefined]
      if (coach && (await bcrypt.compare(password, coach.password_hash))) {
        const token = await signTeamSession({ teamId: coach.team_id, adminEmail: coach.email })
        const res = NextResponse.json({ success: true, redirect: '/team/dashboard' })
        res.cookies.set(teamSessionCookieOptions(token))
        clearOtherSessions(res, TEAM_COOKIE)
        return res
      }
    } catch (err) {
      console.warn('team_coaches lookup failed (table may not exist yet):', err instanceof Error ? err.message : err)
    }

    // 4. Player account
    const [user] = (await db`
      SELECT id, email, password_hash FROM users WHERE email = ${emailLower}
    `) as unknown as [{ id: string; email: string; password_hash: string | null } | undefined]

    // Accounts created with Google or Apple have no password. Saying so beats
    // "invalid email or password", which sends someone who has never had a
    // password off to reset one they don't have.
    if (user && !user.password_hash) {
      let provider: string | undefined
      try {
        const [identity] = (await db`
          SELECT provider FROM user_oauth_identities
          WHERE user_id = ${user.id}
          ORDER BY last_login_at DESC NULLS LAST
          LIMIT 1
        `) as unknown as [{ provider: string } | undefined]
        provider = identity?.provider
      } catch {
        // Table missing (migration not applied yet) — fall through to the
        // generic wording rather than failing the login request.
      }
      const label = provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google' : null
      return NextResponse.json(
        {
          error: label
            ? `This account signs in with ${label}. Use the "Continue with ${label}" button above.`
            : 'This account has no password yet. Use "Forgot password?" to set one.',
        },
        { status: 401 }
      )
    }

    if (user?.password_hash && (await bcrypt.compare(password, user.password_hash))) {
      await redeemClaim(claimToken, user.id)
      const token = await signSession({ userId: user.id, email: user.email })
      const res = NextResponse.json({ success: true, token })
      res.cookies.set(sessionCookieOptions(token))
      clearOtherSessions(res, PLAYER_COOKIE)
      return res
    }

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
