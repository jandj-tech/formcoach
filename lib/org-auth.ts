import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { jwtSecret } from '@/lib/env'
import { db } from '@/lib/db'

const COOKIE = 'fc_org_session'
const TTL = 60 * 60 * 24 * 30 // 30 days

export interface OrgSessionPayload {
  orgId: string
  adminEmail: string
  // See lib/auth.ts — stamped so an org token is trusted over Bearer (the
  // mobile app) without a cookie name to identify it.
  kind?: 'org'
  /** Credential fingerprint — see sessionCredentialFingerprint(). */
  cv?: string
}

/**
 * A short, one-way fingerprint of the credential a session was issued under.
 *
 * Org, team and player sessions are 30-day JWTs. Before this, a JWT only proved we
 * minted it, so a password reset did not end sessions minted under the OLD
 * password — a squatter who had registered under a real coach's address kept
 * working (and could see that coach's tokens) after the real coach reset it.
 * Every org/team session now carries `cv`, derived from the password hash of
 * the exact row it was issued for; each request recomputes it from the row as
 * it is NOW, so a reset or change (new hash) ends every older session.
 *
 * Keyed by a key derived from JWT_SECRET (never the raw secret), truncated to
 * 16 base64url chars (96 bits) — it reveals nothing about the hash. `scope`
 * keeps org and team fingerprints from ever colliding. A null hash (an org
 * that only signs in with Google/Apple) is fingerprinted as a fixed literal.
 */
let cvKey: Buffer | null = null
export function sessionCredentialFingerprint(
  scope: 'org' | 'team' | 'player',
  id: string,
  email: string,
  passwordHash: string | null,
): string {
  if (!cvKey) cvKey = createHmac('sha256', Buffer.from(jwtSecret())).update('learnhoops/session-credential/v1').digest()
  return createHmac('sha256', cvKey)
    .update(`${scope}:${id}:${email.toLowerCase().trim()}:${passwordHash ?? 'org'}`)
    .digest('base64url')
    .slice(0, 16)
}

export function fingerprintMatches(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * `passwordHash` is the organization row's password_hash at the moment the
 * session is issued (null for a password-less OAuth org). Required, so every
 * minting site has to say which credential the session stands on.
 */
export async function signOrgSession(
  payload: { orgId: string; adminEmail: string },
  passwordHash: string | null,
): Promise<string> {
  const cv = sessionCredentialFingerprint('org', payload.orgId, payload.adminEmail, passwordHash)
  return new SignJWT({ orgId: payload.orgId, adminEmail: payload.adminEmail, kind: 'org', cv } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret())
}

/** The org's current password hash (null when it has none or does not exist). */
export async function currentOrgPasswordHash(orgId: string): Promise<string | null> {
  try {
    const [row] = (await db`
      SELECT password_hash FROM organizations WHERE id = ${orgId}
    `) as unknown as [{ password_hash: string | null } | undefined]
    return row?.password_hash ?? null
  } catch {
    return null
  }
}

/**
 * Signature, shape, AND the database: the org still exists, its admin is
 * still this email, and its password is still the one the session was issued
 * under. Tokens minted before `cv` existed are rejected (the admin signs in
 * again). Fails closed on a database error.
 */
export async function verifyOrgSession(token: string): Promise<OrgSessionPayload | null> {
  let claims: OrgSessionPayload
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] })
    claims = payload as unknown as OrgSessionPayload
  } catch {
    return null
  }
  if (typeof claims.orgId !== 'string' || !claims.orgId) return null
  if (typeof claims.adminEmail !== 'string' || !claims.adminEmail) return null
  if (claims.kind !== undefined && claims.kind !== 'org') return null
  if (typeof claims.cv !== 'string') return null
  try {
    const [row] = (await db`
      SELECT admin_email, password_hash FROM organizations WHERE id = ${claims.orgId}
    `) as unknown as [{ admin_email: string; password_hash: string | null } | undefined]
    if (!row) return null
    if (row.admin_email.toLowerCase().trim() !== claims.adminEmail.toLowerCase().trim()) return null
    const expected = sessionCredentialFingerprint('org', claims.orgId, claims.adminEmail, row.password_hash)
    return fingerprintMatches(claims.cv, expected) ? claims : null
  } catch {
    return null
  }
}

export async function getOrgSession(): Promise<OrgSessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  return verifyOrgSession(token)
}

export async function getOrgSessionFromRequest(req: NextRequest): Promise<OrgSessionPayload | null> {
  // Mobile app: org session arrives as a Bearer token, and when the header is
  // present it is the request's whole identity — cookies are ignored (see
  // lib/auth.ts for why). verifyOrgSession requires an org-shaped token
  // (orgId, kind 'org' or absent) so a player/team token can't be accepted.
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) return verifyOrgSession(auth.slice(7))

  const token = req.cookies.get(COOKIE)?.value
  if (token) return verifyOrgSession(token)

  return null
}

export function orgSessionCookieOptions(token: string) {
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
