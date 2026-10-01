import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { inviteAcceptPasswordHash, recordInviteInboxProof, signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitByIp } from '@/lib/rate-limit'
import { acceptSameOrgCoachInvites } from '@/lib/coach-invite-accept'

// GET ?token= — read-only: is this head-coach setup link still unused? Lets
// the page say "already used" before a password is typed. Nothing else is
// returned, and nothing is consumed or rotated.
export async function GET(req: NextRequest) {
  const limit = await rateLimitByIp(req, 'team-setup-peek', 120, 3600)
  if (!limit.ok) return NextResponse.json({ valid: null }, { status: 429 })
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!/^[0-9a-f]{16,128}$/i.test(token)) return NextResponse.json({ valid: false })
  const rows = (await db`SELECT 1 FROM teams WHERE coach_invite_token = ${token} LIMIT 1`) as unknown as unknown[]
  return NextResponse.json({ valid: rows.length > 0 })
}

export async function POST(req: NextRequest) {
  try {
    // This trades a bare token for a team password and a session, so an
    // unlimited endpoint is a token-guessing oracle. Every other credential
    // route is capped; this one was not.
    const limit = await rateLimitByIp(req, 'team-setup', 60, 900)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { token, password } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Setup token is required' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password (6+ characters) required' }, { status: 400 })
    }

    const [team] = await db`
      SELECT id, admin_email FROM teams WHERE coach_invite_token = ${token}
    ` as unknown as [{ id: string; admin_email: string } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Invalid or expired setup link' }, { status: 404 })
    }

    // Set on this invited team row only (see inviteAcceptPasswordHash): a new
    // password is accepted even when the address is already used elsewhere.
    const hash = await inviteAcceptPasswordHash(team.admin_email, password, BCRYPT_COST, { teamId: team.id })

    await db`
      UPDATE teams
      SET password_hash = ${hash}, coach_invite_token = NULL, invite_sent_at = NULL
      WHERE id = ${team.id}
    `
    // The head-coach setup link is only ever emailed (org add-team / resend),
    // so accepting it proves this inbox: the coach's tokens and self-uploads
    // unlock now, even if a squatter holds another row on this address.
    await recordInviteInboxProof({ teamId: team.id }, hash)
    // That proven inbox also accepts this coach's other pending invites in
    // the same organization, so every team shows in the switcher right away.
    await acceptSameOrgCoachInvites(team.admin_email, hash, { teamId: team.id })

    const sessionToken = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email }, hash)
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('Team setup error:', err)
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 })
  }
}
