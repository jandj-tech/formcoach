import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest, signSession, sessionCookieOptions } from '@/lib/auth'
import { clearOtherSessions, PLAYER_COOKIE } from '@/lib/sessions'
import { rateLimitByIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * "Switch player" inside one shared login (users.login_group_id).
 *
 *   GET  → { currentId, players: [{ id, firstName }] } — every account in the
 *          signed-in player's group, current one included (just the current
 *          one when there is no group).
 *   POST { playerId } → a player session for another account in the SAME
 *          group, as a cookie and `token` (Bearer for the app). 403 for any
 *          account outside the group.
 *
 * Joining a group already required the other account's password or an inbox
 * confirmation (lib/account-family.ts), which is what makes this switch
 * passwordless.
 */

interface Member {
  id: string
  email: string
  password_hash: string | null
  first_name: string | null
  nickname: string | null
  login_group_id: string | null
}

function displayFirstName(p: { first_name: string | null; nickname: string | null }, i: number): string {
  return p.first_name?.trim() || p.nickname?.trim() || `Player ${i + 1}`
}

async function groupMembers(me: Member): Promise<Member[]> {
  if (!me.login_group_id) return [me]
  return (await db`
    SELECT id, email, password_hash, first_name, nickname, login_group_id
    FROM users WHERE login_group_id = ${me.login_group_id}
    ORDER BY created_at ASC NULLS LAST, id ASC
  `) as unknown as Member[]
}

async function currentMember(userId: string): Promise<Member | null> {
  const [me] = (await db`
    SELECT id, email, password_hash, first_name, nickname, login_group_id
    FROM users WHERE id = ${userId}
  `) as unknown as [Member | undefined]
  return me ?? null
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const me = await currentMember(session.userId)
  if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const members = await groupMembers(me)
  return NextResponse.json({
    currentId: me.id,
    players: members.map((m, i) => ({ id: m.id, firstName: displayFirstName(m, i) })),
  })
}

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'player-switch', 30, 900)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const session = await getSessionFromRequest(req)
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as { playerId?: unknown }
    if (typeof body.playerId !== 'string' || !body.playerId) {
      return NextResponse.json({ error: 'Player is required' }, { status: 400 })
    }

    const me = await currentMember(session.userId)
    if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const members = await groupMembers(me)
    const index = members.findIndex(m => m.id === body.playerId)
    const target = index >= 0 ? members[index] : undefined
    if (!me.login_group_id || !target || target.login_group_id !== me.login_group_id) {
      return NextResponse.json(
        { error: 'You can only switch between players who share this login.' },
        { status: 403 }
      )
    }

    // Bound to the target's own current credential, like every player session.
    const token = await signSession({ userId: target.id, email: target.email }, target.password_hash)
    const res = NextResponse.json({
      success: true,
      token,
      player: { id: target.id, firstName: displayFirstName(target, index) },
    })
    res.cookies.set(sessionCookieOptions(token))
    clearOtherSessions(res, PLAYER_COOKIE)
    return res
  } catch (err) {
    console.error('Player switch error:', err)
    return NextResponse.json({ error: 'Failed to switch player' }, { status: 500 })
  }
}
