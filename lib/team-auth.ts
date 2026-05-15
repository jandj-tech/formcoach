import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'formcoach-fallback-secret-change-in-prod'
)
const COOKIE = 'fc_team_session'
const TTL = 60 * 60 * 24 * 30 // 30 days

export interface TeamSessionPayload {
  teamId: string
  adminEmail: string
}

export async function signTeamSession(payload: TeamSessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(SECRET)
}

export async function verifyTeamSession(token: string): Promise<TeamSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as TeamSessionPayload
  } catch {
    return null
  }
}

export async function getTeamSession(): Promise<TeamSessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  return verifyTeamSession(token)
}

export async function getTeamSessionFromRequest(req: NextRequest): Promise<TeamSessionPayload | null> {
  const token = req.cookies.get(COOKIE)?.value
  if (!token) return null
  return verifyTeamSession(token)
}

export function teamSessionCookieOptions(token: string) {
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
