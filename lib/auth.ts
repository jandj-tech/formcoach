import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { jwtSecret } from '@/lib/env'
import { db } from '@/lib/db'
import { fingerprintMatches, sessionCredentialFingerprint } from '@/lib/org-auth'

const COOKIE = 'fc_session'
const TTL = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  userId: string
  email: string
  // Discriminates player tokens from team/org tokens. Absent on tokens minted
  // before this field existed (and on every web cookie, which is why the
  // cookie paths below stay lenient); required to trust a token over Bearer,
  // where there is no cookie name to tell the three session types apart.
  kind?: 'player'
  /**
   * Credential fingerprint (lib/org-auth.ts sessionCredentialFingerprint) of
   * the users row's password_hash when the session was issued — 'oauth' for a
   * password-less (Google/Apple) account. Re-derived from the row on every
   * request, so setting or resetting the password ends every older session:
   * a stranger who registered under someone's address loses their session
   * the moment the real owner takes the account over through the inbox link.
   */
  cv?: string
}

const NO_PASSWORD = 'oauth'

function playerFingerprint(userId: string, passwordHash: string | null): string {
  // The email is deliberately not part of it: the session's userId is the
  // identity; the password is the credential.
  return sessionCredentialFingerprint('player', userId, '', passwordHash ?? NO_PASSWORD)
}

/**
 * The same per-account credential fingerprint a player session's `cv` carries.
 * Exported for the player-choice token (lib/player-accounts.ts), which binds
 * each account it offers to the password hash that matched, exactly as a
 * session does.
 */
export function playerCredentialFingerprint(userId: string, passwordHash: string | null): string {
  return playerFingerprint(userId, passwordHash)
}

/**
 * `passwordHash` is the users row's password_hash the caller just proved (the
 * password that matched, the hash it just wrote) — or null for a
 * password-less OAuth account. Required, so every minting site binds.
 */
export async function signSession(
  payload: { userId: string; email: string },
  passwordHash: string | null,
): Promise<string> {
  const cv = playerFingerprint(payload.userId, passwordHash)
  return new SignJWT({ userId: payload.userId, email: payload.email, kind: 'player', cv } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret())
}

/** The user's current password hash — for minting sites that did not just read it. */
export async function currentUserPasswordHash(userId: string): Promise<string | null> {
  const [row] = (await db`
    SELECT password_hash FROM users WHERE id = ${userId}
  `) as unknown as [{ password_hash: string | null } | undefined]
  return row?.password_hash ?? null
}

/**
 * Signature, shape (a player token: non-empty userId, kind 'player' or
 * absent — never a team/org token), AND the database: the user still exists
 * and its password is still the one the session was issued under. One
 * primary-key lookup. Tokens minted before `cv` existed are rejected (the
 * player signs in again). Fails closed on a database error.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  let claims: SessionPayload
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] })
    claims = payload as unknown as SessionPayload
  } catch {
    return null
  }
  if (typeof claims.userId !== 'string' || !claims.userId) return null
  if (claims.kind !== undefined && claims.kind !== 'player') return null
  if (typeof claims.cv !== 'string' || !claims.cv) return null
  try {
    const [row] = (await db`
      SELECT password_hash FROM users WHERE id = ${claims.userId}
    `) as unknown as [{ password_hash: string | null } | undefined]
    if (!row) return null
    return fingerprintMatches(claims.cv, playerFingerprint(claims.userId, row.password_hash)) ? claims : null
  } catch {
    // A malformed id (not a uuid) or a database hiccup: fail closed.
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  // Mobile app sends JWT as Bearer token instead of cookie. When the header is
  // present the request is the app's and the Bearer is its whole identity:
  // cookies are ignored, because iOS shares the WebView cookie jar with native
  // fetch and a stale player cookie must never outrank a coach/org Bearer.
  // Reject team/org tokens here so one can't be replayed on player routes.
  // Legacy player tokens have no `kind` and stay valid — but a legacy team/org
  // token also has no `kind` and MUST NOT half-pass as a player (it produced a
  // split "player with no userId" state in the app), so the player-only field
  // `userId` is required too.
  // verifySession enforces all of that (and the credential binding).
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) return verifySession(auth.slice(7))

  const cookieToken = req.cookies.get(COOKIE)?.value
  if (cookieToken) return verifySession(cookieToken)

  return null
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: TTL,
  }
}
