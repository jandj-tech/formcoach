import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { jwtSecret } from '@/lib/env'

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
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload, kind: 'player' } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret())
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret())
    return payload as unknown as SessionPayload
  } catch {
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
  const cookieToken = req.cookies.get(COOKIE)?.value
  if (cookieToken) return verifySession(cookieToken)

  // Mobile app sends JWT as Bearer token instead of cookie. Reject team/org
  // tokens here so one can't be replayed on player routes. Legacy player
  // tokens have no `kind` and stay valid — but a legacy team/org token also
  // has no `kind` and MUST NOT half-pass as a player (it produced a split
  // "player with no userId" state in the app), so the player-only field
  // `userId` is required too.
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const payload = await verifySession(auth.slice(7))
    if (
      payload &&
      typeof payload.userId === 'string' &&
      payload.userId.length > 0 &&
      (payload.kind === undefined || payload.kind === 'player')
    ) {
      return payload
    }
    return null
  }

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
