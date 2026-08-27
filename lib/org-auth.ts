import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { jwtSecret } from '@/lib/env'

const COOKIE = 'fc_org_session'
const TTL = 60 * 60 * 24 * 30 // 30 days

export interface OrgSessionPayload {
  orgId: string
  adminEmail: string
  // See lib/auth.ts — stamped so an org token is trusted over Bearer (the
  // mobile app) without a cookie name to identify it. Legacy tokens/cookies
  // lack it and are still honored on the cookie path.
  kind?: 'org'
}

export async function signOrgSession(payload: OrgSessionPayload): Promise<string> {
  return new SignJWT({ ...payload, kind: 'org' } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret())
}

export async function verifyOrgSession(token: string): Promise<OrgSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret())
    return payload as unknown as OrgSessionPayload
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
  const token = req.cookies.get(COOKIE)?.value
  if (token) return verifyOrgSession(token)

  // Mobile app: org session arrives as a Bearer token. Require kind === 'org'
  // so a player/team token can't be accepted here.
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const payload = await verifyOrgSession(auth.slice(7))
    return payload?.kind === 'org' ? payload : null
  }

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
