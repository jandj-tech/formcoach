import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'formcoach-fallback-secret-change-in-prod'
)
const COOKIE = 'fc_org_session'
const TTL = 60 * 60 * 24 * 30 // 30 days

export interface OrgSessionPayload {
  orgId: string
  adminEmail: string
}

export async function signOrgSession(payload: OrgSessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(SECRET)
}

export async function verifyOrgSession(token: string): Promise<OrgSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
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
  if (!token) return null
  return verifyOrgSession(token)
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
