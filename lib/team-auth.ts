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
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] })
    const claims = payload as unknown as TeamSessionPayload & { kind?: string }
    // Every token this app signs shares one HMAC key, so verifying the
    // signature only proves we minted it — not that we minted it for THIS
    // purpose. A team-choice token (below) carries `teamIds`, not `teamId`;
    // without this guard it would verify here and yield a session whose
    // teamId is undefined, which every downstream query would silently treat
    // as "no rows" rather than as the forgery it is.
    if (typeof claims.teamId !== 'string' || !claims.teamId) return null
    if (claims.kind !== undefined && claims.kind !== 'team') return null
    return claims
  } catch {
    return null
  }
}

/**
 * Short-lived proof that a password check just succeeded for a coach who owns
 * more than one team, naming exactly the teams they may choose between.
 *
 * Login cannot issue a team session yet — it does not know which team the coach
 * wants — but the choice endpoint still has to know the password was checked.
 * Before this existed, /api/team/select minted a full session from a teamId and
 * an email alone, so anyone holding those two values had permanent passwordless
 * access to that team's roster, chat and credits.
 */
export interface TeamChoicePayload {
  teamIds: string[]
  adminEmail: string
  kind: 'team-choice'
}

const CHOICE_TTL = 60 * 10 // 10 minutes — long enough to pick from a list

export async function signTeamChoice(adminEmail: string, teamIds: string[]): Promise<string> {
  return new SignJWT({ teamIds, adminEmail, kind: 'team-choice' } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHOICE_TTL}s`)
    .sign(jwtSecret())
}

export async function verifyTeamChoice(token: string): Promise<TeamChoicePayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] })
    const claims = payload as unknown as TeamChoicePayload
    if (claims.kind !== 'team-choice') return null
    if (!Array.isArray(claims.teamIds) || claims.teamIds.length === 0) return null
    if (typeof claims.adminEmail !== 'string' || !claims.adminEmail) return null
    return claims
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
  // Mobile app: team session arrives as a Bearer token, and when the header is
  // present it is the request's whole identity — cookies are ignored (see
  // lib/auth.ts for why). Require kind === 'team' so a player/org token can't
  // be accepted here. Legacy team tokens (minted before `kind` existed) are
  // recognised by their `teamId` — a field no player or org token carries — so
  // a coach who logged in on an old build isn't silently logged out.
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const payload = await verifyTeamSession(auth.slice(7))
    if (!payload || typeof payload.teamId !== 'string' || !payload.teamId) return null
    return payload.kind === 'team' || payload.kind === undefined ? payload : null
  }

  const token = req.cookies.get(COOKIE)?.value
  if (token) return verifyTeamSession(token)

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
