import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { inviteAcceptPasswordHash, recordInviteInboxProof, signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { BCRYPT_COST } from '@/lib/password'
import { acceptSameOrgCoachInvites } from '@/lib/coach-invite-accept'
import { rateLimitByIp } from '@/lib/rate-limit'

// GET ?token= — read-only: is this coach invite link still unused? Nothing
// else is returned, and nothing is consumed or rotated.
export async function GET(req: NextRequest) {
  const limit = await rateLimitByIp(req, 'coach-signup-peek', 120, 3600)
  if (!limit.ok) return NextResponse.json({ valid: null }, { status: 429 })
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!/^[0-9a-f]{16,128}$/i.test(token)) return NextResponse.json({ valid: false })
  const rows = (await db`SELECT 1 FROM team_coaches WHERE invite_token = ${token} LIMIT 1`) as unknown as unknown[]
  return NextResponse.json({ valid: rows.length > 0 })
}

// A newly-invited coach sets their password via the signup link, which logs
// them into the team dashboard.
export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid signup link' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password (6+ characters) required' }, { status: 400 })
    }

    const [coach] = (await db`
      SELECT id, team_id, email, invite_emailed_only FROM team_coaches WHERE invite_token = ${token}
    `) as unknown as [{ id: string; team_id: string; email: string; invite_emailed_only: boolean | null } | undefined]

    if (!coach) {
      return NextResponse.json({ error: 'This signup link is invalid or already used.' }, { status: 404 })
    }

    // The password is set on THIS invite row only — never on the email's
    // other rows — so a new password is always accepted (a stranger's
    // self-registered team under this address cannot block the real coach),
    // and a shared link still cannot change the coach's other teams. Typing
    // the password already used elsewhere reuses that credential.
    const hash = await inviteAcceptPasswordHash(coach.email, password, BCRYPT_COST, { coachId: coach.id })
    await db`
      UPDATE team_coaches SET password_hash = ${hash}, invite_token = NULL WHERE id = ${coach.id}
    `
    // Inbox proof only when the link went solely to this inbox (the inviter
    // was never shown it — see recordInviteInboxProof).
    await recordInviteInboxProof({ coachId: coach.id }, hash)
    // A link that went only to this inbox proves it, so the coach's other
    // pending invites in the same organization are accepted too (one email
    // opened, every team in the switcher). A link the inviter was shown
    // proves nothing and accepts only itself.
    if (coach.invite_emailed_only === true) {
      await acceptSameOrgCoachInvites(coach.email, hash, { coachId: coach.id })
    }

    const sessionToken = await signTeamSession({ teamId: coach.team_id, adminEmail: coach.email }, hash)
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('Coach signup error:', err)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
