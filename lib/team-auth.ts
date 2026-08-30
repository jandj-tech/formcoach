import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { jwtSecret } from '@/lib/env'

const COOKIE = 'fc_team_session'
const TTL = 60 * 60 * 24 * 30 // 30 days

export interface TeamSessionPayload {
  teamId: string
  adminEmail: string
  // See lib/auth.ts — stamped so a team token is trusted over Bearer (the
  // mobile app) without a cookie name to identify it. Legacy tokens/cookies
  // lack it and are still honored on the cookie path.
  kind?: 'team'
}

export async function signTeamSession(payload: TeamSessionPayload): Promise<string> {
  return new SignJWT({ ...payload, kind: 'team' } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret())
}

export async function verifyTeamSession(token: string): Promise<TeamSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret())
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
  if (token) return verifyTeamSession(token)

  // Mobile app: team session arrives as a Bearer token. Require kind === 'team'
  // so a player/org token can't be accepted here. Legacy team tokens (minted
  // before `kind` existed) are recognised by their `teamId` — a field no
  // player or org token carries — so a coach who logged in on an old build
  // isn't silently logged out.
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const payload = await verifyTeamSession(auth.slice(7))
    if (!payload || typeof payload.teamId !== 'string' || !payload.teamId) return null
    return payload.kind === 'team' || payload.kind === undefined ? payload : null
  }

  return null
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
