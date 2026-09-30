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

import { createHmac, randomBytes } from 'crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { requireEnv } from '@/lib/env'
import { db } from '@/lib/db'
import { currentUserPasswordHash, signSession, sessionCookieOptions } from '@/lib/auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE } from '@/lib/sessions'
import { addToEmailList } from '@/lib/email-list'
import { cleanOptionalDisplayText } from '@/lib/moderation'
import { adoptLegacySubmissions, claimPendingInvite } from '@/lib/roster-players'
import { markEmailVerified, applyEmailEntitlement } from '@/lib/email-entitlements'
import { playersByEmail, type PlayerAccount } from '@/lib/player-accounts'
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

/**
 * A sign-in that cannot complete, with a message fit to show the person.
 * `code` is what the web callback puts in the /login?error=oauth_<code> URL.
 */
export class OAuthSignInError extends Error {
  constructor(
    message: string,
    readonly code: 'no_email' | 'choose_account' | 'email_unverified' = 'no_email',
    /**
     * choose_account only: the verified address and the player accounts on it
     * the provider could be linked to (2+). The web callback turns these into
     * the "Which player?" chooser (signOAuthPlayerChoice); the native app,
     * which has no chooser yet, shows `message`.
     */
    readonly choice?: { email: string; candidates: PlayerAccount[] },
  ) {
    super(message)
  }
}

/**
 * Several player accounts share this verified address and more than one could
 * be the one meant, so there is no account to link the provider to. The
 * website shows a chooser; the app (no chooser yet) is told to use the
 * password, which decides.
 */
const CHOOSE_ACCOUNT_MESSAGE =
  'More than one player uses this email address. Log in with that player’s email and password instead, or use Continue with Google/Apple on learnhoops.com to choose the player.'

/**
 * The one player account a provider sign-in may be linked to by email, or
 * null when that is ambiguous. One account on the address: that account (as
 * always). Several (siblings on a parent's inbox): only when exactly one of
 * them has no identity from this provider yet.
 */
async function unlinkedPlayers(
  players: PlayerAccount[],
  provider: string,
): Promise<PlayerAccount[]> {
  if (players.length === 0) return []
  const linked = (await db`
    SELECT DISTINCT user_id FROM user_oauth_identities
    WHERE provider = ${provider} AND user_id = ANY(${players.map((p) => p.id)}::uuid[])
  `) as unknown as Array<{ user_id: string }>
  const linkedIds = new Set(linked.map((r) => r.user_id))
  return players.filter((p) => !linkedIds.has(p.id))
}

async function linkTargetByEmail(
  players: PlayerAccount[],
  provider: string,
): Promise<{ target: PlayerAccount | null; candidates: PlayerAccount[] }> {
  if (players.length === 1) return { target: players[0], candidates: players }
  const unlinked = await unlinkedPlayers(players, provider)
  return { target: unlinked.length === 1 ? unlinked[0] : null, candidates: unlinked }
}

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
    SELECT id, admin_email, password_hash FROM organizations WHERE admin_email = ${email}
  `) as unknown as [{ id: string; admin_email: string; password_hash: string | null } | undefined]
  if (org) {
    const token = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email }, org.password_hash)
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
    SELECT id, admin_email, name, password_hash FROM teams
    WHERE admin_email = ${email} AND password_hash IS NOT NULL
    ORDER BY name ASC
  `) as unknown as Array<{ id: string; admin_email: string; name: string; password_hash: string }>
  if (teams.length > 0) {
    const token = await signTeamSession({ teamId: teams[0].id, adminEmail: teams[0].admin_email }, teams[0].password_hash)
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
      SELECT team_id, email, password_hash FROM team_coaches
      WHERE email = ${email} AND password_hash IS NOT NULL
    `) as unknown as [{ team_id: string; email: string; password_hash: string } | undefined]
    if (coach) {
      const token = await signTeamSession({ teamId: coach.team_id, adminEmail: coach.email }, coach.password_hash)
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
  if (identityUser) {
    // The provider verified this address; if it is the account's own, that is
    // proof of the inbox (and activates a comp waiting on it).
    await proveInbox(identityUser.id, email)
    return playerResult(identityUser, false)
  }

  // 5. Existing player with this address — link the provider to it. This is the
  //    path that keeps someone who signed up with a password from accidentally
  //    creating a second, empty account by tapping "Continue with Google".
  //    Several player accounts may share the address (siblings): link only
  //    when exactly one of them is the candidate, otherwise refuse clearly.
  const players = await playersByEmail(email)
  if (players.length > 0) {
    const { target: user, candidates } = await linkTargetByEmail(players, profile.provider)
    if (!user) {
      // 2+ unlinked accounts: the provider proved the inbox, so the web lets
      // the person pick (no password needed). Zero unlinked (every account
      // already carries a DIFFERENT identity from this provider): nothing to
      // offer; the password decides.
      throw new OAuthSignInError(
        CHOOSE_ACCOUNT_MESSAGE,
        'choose_account',
        candidates.length >= 2 ? { email, candidates } : undefined,
      )
    }
    return linkAndSignIn(user, profile, email)
  }

  // 6. Nobody by that address — new player account.
  return createPlayer(profile, email)
}

/** Links the provider identity to an existing player account and signs it in. */
async function linkAndSignIn(
  user: { id: string; email: string },
  profile: OAuthProfile,
  email: string,
): Promise<OAuthSignInResult> {
  await linkIdentity(user.id, profile, email)
  // A coach/org-added stub that signs in with a provider has completed setup.
  await db`UPDATE users SET roster_pending = false WHERE id = ${user.id} AND roster_pending = true`
  await proveInbox(user.id, email)
  return playerResult(user, false)
}

async function createPlayer(profile: OAuthProfile, email: string | null): Promise<OAuthSignInResult> {
  // `email` is only non-null when the provider verified the address. Without
  // that, the address is just a string the token carries: it must never find,
  // claim, or create an account — not even a brand-new one, or anyone could
  // squat an address and inherit whatever the real owner does with it later
  // (step 5 would link their verified sign-in straight into the squatter's
  // account). Apple always verifies, including private-relay addresses.
  if (!email) {
    if (!profile.email) {
      // `users.email` is NOT NULL and every receipt, reset and report we send
      // needs somewhere to go.
      throw new OAuthSignInError('That sign-in did not share an email address, so we could not create an account.')
    }
    const providerName = profile.provider === 'apple' ? 'Apple' : 'Google'
    throw new OAuthSignInError(
      `Your ${providerName} account's email isn't verified yet. Verify it with ${providerName}, or sign up with your email and a password instead.`,
      'email_unverified'
    )
  }
  const addr = email

  // The provider's display name is user-controlled too: same rule as every
  // other name save site. A name that fails it is simply not used.
  const nickClean = cleanOptionalDisplayText(profile.name?.trim().split(/\s+/)[0] ?? null, 50)
  const nickname = nickClean.ok ? nickClean.value : null

  // free_analysis_used = true matches the password signup route: the free first
  // analysis is discontinued, and a provider account must not become a way
  // around that.
  //
  // Unverified addresses were refused above, so `addr` is always proven here.
  //
  // No ON CONFLICT (email): the unique constraint on users.email is dropped by
  // scripts/migrate-family-email.sql (several player accounts may share an
  // address), and ON CONFLICT on a constraint that no longer exists is an
  // error. Instead the insert is conditional on no player row carrying the
  // address, under a transaction-scoped advisory lock on the address so two
  // concurrent first sign-ins cannot both create one.
  const created = (await db.begin(async (t) => {
    const tx = t as unknown as typeof db
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'users-email:' + addr}))`
    const [existing] = (await tx`
      SELECT id, email FROM users WHERE LOWER(email) = ${addr}
      ORDER BY created_at ASC NULLS LAST, id ASC
    `) as unknown as Array<{ id: string; email: string }>
    if (existing) {
      // The lookup in signInWithOAuthProfile found no player a moment ago, so
      // this is the losing side of a race — the account the winner just
      // created is this person's (the provider verified the address).
      return existing
    }
    const [row] = (await tx`
      INSERT INTO users (email, password_hash, nickname, free_analysis_used, email_verified_at)
      VALUES (${addr}, NULL, ${nickname}, true, ${email ? new Date() : null})
      RETURNING id, email
    `) as unknown as [{ id: string; email: string }]
    return row
  })) as { id: string; email: string } | undefined
  if (!created) {
    throw new OAuthSignInError('An account already uses this email address. Log in with your password instead.')
  }

  // The identity keeps the address only when the provider verified it — that
  // column is what later counts as proof (migrate-email-verified.sql).
  await linkIdentity(created.id, profile, email)

  if (email) {
    // Adopt any analyses this address submitted before it had an account —
    // same rule as password signup: never a coach's or org admin's
    // self-uploads (see adoptLegacySubmissions). Verified addresses only.
    await adoptLegacySubmissions(created.id, addr)
    await proveInbox(created.id, email)
  }

  try { await addToEmailList(addr) } catch { /* non-fatal */ }

  return playerResult(created, true)
}

/** Provider-verified address matches the account's: record the proof, activate any comp. */
async function proveInbox(userId: string, verifiedEmail: string) {
  try {
    if (await markEmailVerified(userId, verifiedEmail)) await applyEmailEntitlement(userId)
  } catch (err) {
    console.warn('OAuth inbox proof failed:', err instanceof Error ? err.message : err)
  }
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
  const token = await signSession({ userId: user.id, email: user.email }, await currentUserPasswordHash(user.id))
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
      // Membership + the shots already uploaded for the invite, in one
      // transaction (shared with password signup).
      await claimPendingInvite(userId, ctx.teamInvite)
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

// ---------------------------------------------------------------------------
// Web "Which player?" after a provider sign-in (several unlinked accounts)
// ---------------------------------------------------------------------------

/**
 * httpOnly cookie carrying the pending provider choice from the web callback
 * to the /login chooser. Scoped to the endpoints that read it.
 */
export const OAUTH_CHOICE_COOKIE = 'fc_oauth_choice'
const OAUTH_CHOICE_PATH = '/api/auth/select-player'
const OAUTH_CHOICE_TTL = 60 * 10 // 10 minutes

/**
 * What the chooser may complete: the provider identity that just proved the
 * inbox (provider + subject — the choice is bound to it), the verified
 * address, and exactly the unlinked accounts on it that were offered. Also the
 * signup context the callback would otherwise have applied.
 *
 * ENCRYPTED (dir/A256GCM with a key derived from JWT_SECRET), not just
 * signed: it carries the Apple refresh token, and a derived key means it can
 * never be mistaken for a session JWT.
 */
interface OAuthChoicePayload {
  kind: 'oauth-player-choice'
  provider: OAuthProfile['provider']
  subject: string
  email: string
  userIds: string[]
  refreshToken?: string | null
  ctx: { claimToken?: string; teamInvite?: string; teamCode?: string; next?: string }
}

let oauthChoiceKey: Uint8Array | undefined
function oauthChoiceKeyBytes(): Uint8Array {
  if (!oauthChoiceKey) {
    oauthChoiceKey = new Uint8Array(
      createHmac('sha256', requireEnv('JWT_SECRET')).update('oauth-player-choice-v1').digest(),
    )
  }
  return oauthChoiceKey
}

function displayFirstName(a: { first_name: string | null; nickname: string | null }, i: number): string {
  return a.first_name?.trim() || a.nickname?.trim() || `Player ${i + 1}`
}

/** The cookie the web callback sets instead of a session when the person must choose. */
export async function oauthPlayerChoiceCookie(
  profile: OAuthProfile,
  choice: { email: string; candidates: PlayerAccount[] },
  ctx: OAuthChoicePayload['ctx'],
) {
  const payload: OAuthChoicePayload = {
    kind: 'oauth-player-choice',
    provider: profile.provider,
    subject: profile.subject,
    email: choice.email,
    userIds: choice.candidates.map((c) => c.id),
    refreshToken: profile.refreshToken ?? null,
    ctx,
  }
  const value = await new EncryptJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_CHOICE_TTL}s`)
    .encrypt(oauthChoiceKeyBytes())
  return {
    name: OAUTH_CHOICE_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: OAUTH_CHOICE_PATH,
    maxAge: OAUTH_CHOICE_TTL,
  }
}

/** Expires the choice cookie (after use, or when it is no good). */
export function clearOAuthPlayerChoiceCookie() {
  return { name: OAUTH_CHOICE_COOKIE, value: '', httpOnly: true, path: OAUTH_CHOICE_PATH, maxAge: 0 }
}

async function readOAuthChoice(value: string | undefined): Promise<OAuthChoicePayload | null> {
  if (!value) return null
  try {
    const { payload } = await jwtDecrypt(value, oauthChoiceKeyBytes())
    const c = payload as unknown as OAuthChoicePayload
    if (c.kind !== 'oauth-player-choice') return null
    if (typeof c.subject !== 'string' || !c.subject || typeof c.email !== 'string' || !c.email) return null
    if (!Array.isArray(c.userIds) || c.userIds.length === 0) return null
    return c
  } catch {
    return null
  }
}

/**
 * The accounts the chooser shows, re-read (still on the address, still not
 * linked to this provider). Null when the cookie is missing, expired or no
 * longer offers at least one account.
 */
export async function oauthPlayerChoiceOptions(
  cookieValue: string | undefined,
): Promise<{ provider: string; players: Array<{ id: string; firstName: string }> } | null> {
  const choice = await readOAuthChoice(cookieValue)
  if (!choice) return null
  const offered = (await playersByEmail(choice.email)).filter((p) => choice.userIds.includes(p.id))
  const open = await unlinkedPlayers(offered, choice.provider)
  if (open.length === 0) return null
  return {
    provider: choice.provider,
    players: open.map((p, i) => ({ id: p.id, firstName: displayFirstName(p, i) })),
  }
}

/**
 * Links the provider identity in the choice cookie to the chosen account and
 * signs it in. The chosen id must be one the cookie offered, still carry the
 * verified address, and still have no identity from this provider; and this
 * provider identity must not have been linked to a different account since.
 * Returns null when any of that fails. Applies the carried signup context.
 */
export async function completeOAuthPlayerChoice(
  cookieValue: string | undefined,
  userId: string,
): Promise<(OAuthSignInResult & { next: string }) | null> {
  const choice = await readOAuthChoice(cookieValue)
  if (!choice || !choice.userIds.includes(userId)) return null

  const offered = (await playersByEmail(choice.email)).filter((p) => p.id === userId)
  const [target] = await unlinkedPlayers(offered, choice.provider)
  if (!target) return null

  const [existing] = (await db`
    SELECT user_id FROM user_oauth_identities
    WHERE provider = ${choice.provider} AND subject = ${choice.subject}
  `) as unknown as [{ user_id: string } | undefined]
  if (existing && existing.user_id !== target.id) return null

  const profile: OAuthProfile = {
    provider: choice.provider,
    subject: choice.subject,
    email: choice.email,
    emailVerified: true,
    name: null,
    refreshToken: choice.refreshToken ?? null,
  }
  const result = await linkAndSignIn(target, profile, choice.email)
  await applySignupContext(target.id, { claimToken: choice.ctx.claimToken, teamInvite: choice.ctx.teamInvite })
  const next = choice.ctx.teamCode
    ? `/join/${encodeURIComponent(choice.ctx.teamCode.toUpperCase())}`
    : choice.ctx.next && choice.ctx.next.startsWith('/') && !choice.ctx.next.startsWith('//')
      ? choice.ctx.next
      : '/dashboard'
  return { ...result, next }
}
