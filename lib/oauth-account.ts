/**
 * Turns a verified provider identity into one of this app's sessions.
 *
 * The rule that matters here: an email address is only trusted to *find* an
 * existing account when the provider says it verified it. Google and Apple both
 * do, but if that flag were ever missing, matching on the address alone would
 * let anyone who can mint an unverified claim walk into someone's account. An
 * unverified address is treated as no address at all.
 *
 * Account lookup follows the same order as password login (organization, team,
 * additional coach, player) so signing in with Google lands a coach on the same
 * dashboard their password does.
 */

import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE } from '@/lib/sessions'
import { addToEmailList } from '@/lib/email-list'
import { grantFreeOrgTokensIfEligible } from '@/lib/team-tokens'
import type { OAuthProfile } from '@/lib/oauth'

export interface OAuthSignInResult {
  accountType: 'player' | 'team' | 'org'
  /** Where a browser should land after this sign-in. */
  redirect: string
  cookie: ReturnType<typeof sessionCookieOptions>
  /** The one session cookie to keep; every other account's cookie is cleared. */
  keepCookie: string
  /** Player sessions only — the JWT the native app stores, and the row a one-time code binds to. */
  userId?: string
  token?: string
  /** True the first time this provider identity created an account. */
  isNewAccount: boolean
}

export class OAuthSignInError extends Error {}

export async function signInWithOAuthProfile(profile: OAuthProfile): Promise<OAuthSignInResult> {
  const email = profile.emailVerified && profile.email ? profile.email.toLowerCase().trim() : null

  // 1. The provider identity we have seen before, if any. It is refreshed here
  //    but does NOT decide the session on its own — see below.
  const [identity] = (await db`
    SELECT user_id FROM user_oauth_identities
    WHERE provider = ${profile.provider} AND subject = ${profile.subject}
  `) as unknown as [{ user_id: string } | undefined]

  let identityUser: { id: string; email: string } | null = null
  if (identity) {
    const [user] = (await db`
      SELECT id, email FROM users WHERE id = ${identity.user_id}
    `) as unknown as [{ id: string; email: string } | undefined]
    if (user) {
      await db`
        UPDATE user_oauth_identities
        SET last_login_at = NOW(),
            email = COALESCE(${email}, email),
            refresh_token = COALESCE(${profile.refreshToken ?? null}, refresh_token)
        WHERE provider = ${profile.provider} AND subject = ${profile.subject}
      `
      identityUser = user
    } else {
      // Identity outlived its user (shouldn't happen — the FK cascades). Drop
      // it and fall through rather than 500-ing.
      await db`
        DELETE FROM user_oauth_identities
        WHERE provider = ${profile.provider} AND subject = ${profile.subject}
      `
    }
  }

  // Without a verified address the provider identity is the only handle we
  // have — that is exactly the Apple private-relay case — so it decides alone.
  if (!email) return identityUser ? playerResult(identityUser, false) : createPlayer(profile, null)

  // 2. Organization admin
  const [org] = (await db`
    SELECT id, admin_email FROM organizations WHERE admin_email = ${email}
  `) as unknown as [{ id: string; admin_email: string } | undefined]
  if (org) {
    const token = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email })
    return {
      accountType: 'org',
      redirect: '/org/dashboard',
      cookie: orgSessionCookieOptions(token),
      keepCookie: ORG_COOKIE,
      isNewAccount: false,
    }
  }

  // 3. Founding coach of one or more teams. A coach with several teams gets
  //    their first team and switches from the dashboard — password login asks
  //    which team, but there is no form to ask in mid-redirect.
  const teams = (await db`
    SELECT id, admin_email, name FROM teams
    WHERE admin_email = ${email} AND password_hash IS NOT NULL
    ORDER BY name ASC
  `) as unknown as Array<{ id: string; admin_email: string; name: string }>
  if (teams.length > 0) {
    const token = await signTeamSession({ teamId: teams[0].id, adminEmail: teams[0].admin_email })
    return {
      accountType: 'team',
      redirect: '/team/dashboard',
      cookie: teamSessionCookieOptions(token),
      keepCookie: TEAM_COOKIE,
      isNewAccount: false,
    }
  }

  // 4. Additional coach on someone else's team
  try {
    const [coach] = (await db`
      SELECT team_id, email FROM team_coaches
      WHERE email = ${email} AND password_hash IS NOT NULL
    `) as unknown as [{ team_id: string; email: string } | undefined]
    if (coach) {
      const token = await signTeamSession({ teamId: coach.team_id, adminEmail: coach.email })
      return {
        accountType: 'team',
        redirect: '/team/dashboard',
        cookie: teamSessionCookieOptions(token),
        keepCookie: TEAM_COOKIE,
        isNewAccount: false,
      }
    }
  } catch (err) {
    console.warn('team_coaches lookup failed during OAuth sign-in:', err instanceof Error ? err.message : err)
  }

  // 4b. No organization or coach account claims this verified address, so the
  //     provider identity we refreshed above is the answer.
  //
  //     Order matters here, and it used to be wrong. This lookup ran FIRST and
  //     returned immediately, so anyone who had ever tapped "Continue with
  //     Google" as a player was pinned to that player account forever — the
  //     org/team/coach checks below it never ran. A coach who signed in with
  //     Google got a player session, landed on the player dashboard, and in the
  //     iOS app saw the "join a team with a code" screen while the webview
  //     (holding a real team cookie) still showed them as the coach. Password
  //     login has always preferred the coach account; this now matches it.
  if (identityUser) return playerResult(identityUser, false)

  // 5. Existing player with this address — link the provider to it. This is the
  //    path that keeps someone who signed up with a password from accidentally
  //    creating a second, empty account by tapping "Continue with Google".
  const [user] = (await db`
    SELECT id, email FROM users WHERE email = ${email}
  `) as unknown as [{ id: string; email: string } | undefined]
  if (user) {
    await linkIdentity(user.id, profile, email)
    return playerResult(user, false)
  }

  // 6. Nobody by that address — new player account.
  return createPlayer(profile, email)
}

async function createPlayer(profile: OAuthProfile, email: string | null): Promise<OAuthSignInResult> {
  // Apple gives a relay address when the user hides theirs; it still routes
  // mail to them, so it is a real address for our purposes. If the provider
  // sent nothing at all we cannot create an account — `users.email` is NOT NULL
  // and every receipt, reset and report we send needs somewhere to go.
  if (!email && !profile.email) {
    throw new OAuthSignInError('That sign-in did not share an email address, so we could not create an account.')
  }
  const addr = (email ?? profile.email!).toLowerCase().trim()

  const nickname = profile.name?.trim().split(/\s+/)[0]?.slice(0, 50) || null

  // free_analysis_used = true matches the password signup route: the free first
  // analysis is discontinued, and a provider account must not become a way
  // around that.
  const [created] = (await db`
    INSERT INTO users (email, password_hash, nickname, free_analysis_used)
    VALUES (${addr}, NULL, ${nickname}, true)
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email
  `) as unknown as [{ id: string; email: string }]

  await linkIdentity(created.id, profile, addr)

  // Adopt any analyses this address submitted before it had an account.
  await db`UPDATE submissions SET user_id = ${created.id} WHERE email = ${addr} AND user_id IS NULL`

  try { await addToEmailList(addr) } catch { /* non-fatal */ }

  return playerResult(created, true)
}

async function linkIdentity(userId: string, profile: OAuthProfile, email: string | null) {
  await db`
    INSERT INTO user_oauth_identities (user_id, provider, subject, email, refresh_token)
    VALUES (${userId}, ${profile.provider}, ${profile.subject}, ${email}, ${profile.refreshToken ?? null})
    ON CONFLICT (provider, subject) DO UPDATE
      SET last_login_at = NOW(),
          email = COALESCE(EXCLUDED.email, user_oauth_identities.email),
          refresh_token = COALESCE(EXCLUDED.refresh_token, user_oauth_identities.refresh_token)
  `
}

async function playerResult(user: { id: string; email: string }, isNewAccount: boolean): Promise<OAuthSignInResult> {
  const token = await signSession({ userId: user.id, email: user.email })
  return {
    accountType: 'player',
    redirect: '/dashboard',
    cookie: sessionCookieOptions(token),
    keepCookie: PLAYER_COOKIE,
    userId: user.id,
    token,
    isNewAccount,
  }
}

// ---------------------------------------------------------------------------
// Signup context
// ---------------------------------------------------------------------------

/**
 * Re-applies the things a redirect to a provider would otherwise throw away.
 *
 * Both branches mirror app/api/auth/signup/route.ts deliberately: a player who
 * bought a ball and then chose "Continue with Google" must end up with exactly
 * the same account as one who typed a password.
 */
export async function applySignupContext(
  userId: string,
  ctx: { claimToken?: string; teamInvite?: string }
): Promise<void> {
  if (ctx.claimToken) {
    try {
      // Consume-and-grant in one statement so a concurrent redemption can never
      // grant the same claim twice.
      await db`
        WITH claim AS (
          UPDATE pending_credit_claims SET redeemed_at = NOW()
          WHERE claim_token = ${ctx.claimToken} AND redeemed_at IS NULL AND tokens_to_grant > 0
          RETURNING tokens_to_grant
        )
        UPDATE users
        SET analysis_tokens = COALESCE(analysis_tokens, 0) + (SELECT tokens_to_grant FROM claim)
        WHERE id = ${userId} AND EXISTS (SELECT 1 FROM claim)
      `
    } catch (err) {
      console.warn('OAuth claim redemption failed:', err instanceof Error ? err.message : err)
    }
  }

  if (ctx.teamInvite) {
    try {
      const [pending] = (await db`
        SELECT id, team_id, first_name, last_name_initial
        FROM pending_team_members WHERE invite_token = ${ctx.teamInvite}
      `) as unknown as [{ id: string; team_id: string; first_name: string; last_name_initial: string | null } | undefined]
      if (pending) {
        await db`
          INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
          VALUES (${userId}, ${pending.team_id}, ${pending.first_name}, ${pending.last_name_initial})
          ON CONFLICT (user_id, team_id) DO UPDATE
            SET first_name = EXCLUDED.first_name, last_name_initial = EXCLUDED.last_name_initial
        `
        await db`DELETE FROM pending_team_members WHERE id = ${pending.id}`
        await grantFreeOrgTokensIfEligible(pending.team_id)
      }
    } catch (err) {
      console.warn('OAuth team-invite claim failed:', err instanceof Error ? err.message : err)
    }
  }
}

// ---------------------------------------------------------------------------
// Native hand-off
// ---------------------------------------------------------------------------

const LOGIN_CODE_TTL_MS = 2 * 60 * 1000

/**
 * Mints a one-time code for the native app.
 *
 * The app finishes Google sign-in in a system browser, which can only return to
 * it through a `learnhoops://` URL — and a URL is the last place a 30-day
 * session JWT should be, since the OS, any handler and the app's own logs all
 * see it. So the deep link carries a code that is worth nothing on its own and
 * dies two minutes later; the app trades it for the JWT over HTTPS.
 */
export async function createLoginCode(userId: string): Promise<string> {
  const code = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + LOGIN_CODE_TTL_MS)
  await db`
    INSERT INTO oauth_login_codes (code, user_id, expires_at)
    VALUES (${code}, ${userId}, ${expires})
  `
  return code
}

/** Redeems a code exactly once. Returns null if unknown, expired or already used. */
export async function redeemLoginCode(code: string): Promise<{ id: string; email: string } | null> {
  // Consume-and-read in one statement so two concurrent redemptions of the same
  // code cannot both succeed.
  const rows = (await db`
    WITH claimed AS (
      UPDATE oauth_login_codes SET redeemed_at = NOW()
      WHERE code = ${code} AND redeemed_at IS NULL AND expires_at > NOW()
      RETURNING user_id
    )
    SELECT u.id, u.email FROM users u JOIN claimed c ON c.user_id = u.id
  `) as unknown as Array<{ id: string; email: string }>

  // Opportunistic cleanup — the table is write-once and would otherwise grow
  // without bound.
  try {
    await db`DELETE FROM oauth_login_codes WHERE expires_at < NOW() - INTERVAL '1 day'`
  } catch { /* non-fatal */ }

  return rows[0] ?? null
}
