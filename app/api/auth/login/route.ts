import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, signTeamChoice, teamSessionCookieOptions, findCoachTeamsForLogin } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { clearOtherSessions, PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE } from '@/lib/sessions'
import { rateLimitLogin } from '@/lib/rate-limit'
import { matchPlayerPassword, playersByEmail, signPlayerChoice } from '@/lib/player-accounts'

// Shipped app builds (no `acceptsPlayerChoice` in the body) cannot show a
// "Which player?" list, so a shared login is sent to the website.
const SHARED_LOGIN_OLD_APP_MESSAGE =
  'This login is shared by more than one player. Choose your player on learnhoops.com, or set your own password.'

function displayFirstName(p: { first_name: string | null; nickname: string | null }, i: number): string {
  return p.first_name?.trim() || p.nickname?.trim() || `Player ${i + 1}`
}

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

// Browsers always send Origin (or Sec-Fetch-Site) on a fetch POST; the native
// app's fetch sends neither. Used only to pick a UX fallback for the app —
// never as an authorization signal (every branch below has already checked
// the password for the team it signs).
function isNativeAppRequest(req: NextRequest): boolean {
  return !req.headers.get('origin') && !req.headers.get('sec-fetch-site')
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, claimToken, acceptsPlayerChoice } = await req.json()
    // Tight per-account limit, looser per-IP ceiling (a gym shares one IP).
    const limit = await rateLimitLogin(req, 'login', typeof email === 'string' ? email : null)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // 1. Organization account
    const [org] = (await db`
      SELECT id, admin_email, password_hash FROM organizations WHERE admin_email = ${emailLower}
    `) as unknown as [{ id: string; admin_email: string; password_hash: string } | undefined]
    if (org?.password_hash && (await bcrypt.compare(password, org.password_hash))) {
      const token = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email }, org.password_hash)
      // `token` is for the mobile app (Bearer auth); the web ignores it and
      // follows the cookie + redirect.
      const res = NextResponse.json({ success: true, redirect: '/org/dashboard', token })
      res.cookies.set(orgSessionCookieOptions(token))
      clearOtherSessions(res, ORG_COOKIE)
      return res
    }

    // 2. Team coach — head coach rows and added-coach (team_coaches) rows,
    //    each checked against its own password. A coach on several teams
    //    (head of one, assistant on another, or head of two) picks one.
    let coachTeams = await findCoachTeamsForLogin(emailLower, String(password))
    if (coachTeams.length > 1 && isNativeAppRequest(req)) {
      // The iOS app has no team picker yet: on multipleTeams it tells the
      // coach to use the website instead. Before per-row checks existed, a
      // coach who heads ONE team and assists on others landed on their head
      // team in the app — keep that, rather than locking them out of the app.
      // (Heads of 2+ teams already got the website message; unchanged.)
      const heads = coachTeams.filter(t => t.role === 'head')
      if (heads.length === 1) coachTeams = heads
      else if (heads.length === 0) coachTeams = [coachTeams[0]]
    }
    if (coachTeams.length > 1) {
      // The password checked out, but we don't know which team yet. Hand
      // back a short-lived token naming the teams this coach may pick from —
      // /api/team/select requires it, so the choice cannot be forged.
      return NextResponse.json({
        multipleTeams: true,
        teams: coachTeams.map(t => ({ id: t.teamId, name: t.name })),
        choiceToken: await signTeamChoice(emailLower, coachTeams),
      })
    }
    if (coachTeams.length === 1) {
      const team = coachTeams[0]
      const token = await signTeamSession({ teamId: team.teamId, adminEmail: team.email }, team.passwordHash)
      const res = NextResponse.json({ success: true, redirect: '/team/dashboard', token })
      res.cookies.set(teamSessionCookieOptions(token))
      clearOtherSessions(res, TEAM_COOKIE)
      return res
    }

    // 3. Player accounts. Several may share an address (siblings on a
    //    parent's inbox): the password decides which one opens. Every player
    //    account on the address is checked against its OWN password
    //    (matchPlayerPassword; password-less rows never match).
    const players = await playersByEmail(emailLower)
    const matches = await matchPlayerPassword(emailLower, String(password), players)

    if (matches.length === 1) {
      // Exactly as before — the shipped iOS app depends on this shape.
      const user = matches[0]
      await redeemClaim(claimToken, user.id)
      const token = await signSession({ userId: user.id, email: user.email }, user.password_hash)
      const res = NextResponse.json({ success: true, token })
      res.cookies.set(sessionCookieOptions(token))
      clearOtherSessions(res, PLAYER_COOKIE)
      return res
    }

    if (matches.length > 1) {
      // Same password on several accounts: only possible for players who
      // opted into one shared login (users.login_group_id). The names are
      // shown only because this password opened every one of them.
      if (acceptsPlayerChoice !== true) {
        // Shipped app builds have no player chooser (they send no flag).
        return NextResponse.json({ error: SHARED_LOGIN_OLD_APP_MESSAGE }, { status: 401 })
      }
      return NextResponse.json({
        multiplePlayers: true,
        players: matches.map((p, i) => ({ id: p.id, firstName: displayFirstName(p, i) })),
        choiceToken: await signPlayerChoice(emailLower, matches),
      })
    }

    // No password matched. Accounts created with Google or Apple have no
    // password — when EVERY account on the address is like that, saying so
    // beats "invalid email or password", which sends someone who has never
    // had a password off to reset one they don't have. (Nothing here names
    // an account, so a wrong password reveals no siblings.)
    if (players.length > 0 && players.every(p => !p.password_hash)) {
      let provider: string | undefined
      try {
        const [identity] = (await db`
          SELECT provider FROM user_oauth_identities
          WHERE user_id = ANY(${players.map(p => p.id)}::uuid[])
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

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
