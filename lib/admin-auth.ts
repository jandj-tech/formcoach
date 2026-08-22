import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { jwtSecret, requireEnv, safeEqual } from '@/lib/env'

/**
 * Owner ("admin") authentication.
 *
 * This replaces two bad properties of the old scheme, which compared the
 * `admin_auth` cookie directly against `process.env.ADMIN_PASSWORD` in ~20
 * separate route files:
 *
 *  1. It failed OPEN. With ADMIN_PASSWORD unset, a visitor holding no cookie at
 *     all produced `undefined === undefined` → admin access granted everywhere.
 *  2. The cookie's value WAS the plaintext admin password, so the master
 *     credential sat in the browser jar and rode along on every admin request.
 *
 * Now the cookie carries a signed, expiring token that proves a password check
 * happened, and every caller shares one implementation that throws rather than
 * passing when the password is not configured.
 */

const COOKIE = 'admin_auth'
const TTL = 60 * 60 * 24 * 7 // 7 days, unchanged

interface AdminClaims {
  admin: true
}

/** Verifies a submitted password against ADMIN_PASSWORD in constant time. */
export function isAdminPassword(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || !candidate) return false
  // requireEnv throws when unset — a missing admin password must lock the door,
  // not open it.
  return safeEqual(candidate, requireEnv('ADMIN_PASSWORD'))
}

export async function signAdminSession(): Promise<string> {
  return new SignJWT({ admin: true } satisfies AdminClaims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret())
}

async function verify(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, jwtSecret())
    return (payload as unknown as AdminClaims).admin === true
  } catch {
    return false
  }
}

/** True when the caller holds a valid owner session cookie. */
export async function isAdminSession(): Promise<boolean> {
  const store = await cookies()
  return verify(store.get(COOKIE)?.value)
}

/** Request-scoped variant, for handlers that already have the NextRequest. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  return verify(req.cookies.get(COOKIE)?.value)
}

export function adminCookieOptions(token: string) {
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
