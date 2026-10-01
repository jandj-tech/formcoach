import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { resendPlayerSetup, coachDisplayName } from '@/lib/roster-players'
import { rateLimit } from '@/lib/rate-limit'

// One email per player, sent one after another; a big roster takes a while.
export const maxDuration = 60

// Emails the account-setup link to every player on the coach's own team who
// was added with an email and hasn't set a password yet. Any coach on the
// team can, as with the one-player resend. The per-player limit (3 an hour)
// still applies inside resendPlayerSetup, and the team is limited too. Links
// go to each player's inbox only — never back here.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  // The session decides the team. A teamId in the body is only checked, so a
  // stale tab (switched to another team since) can't send for the wrong one.
  const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: string }
  if (teamId && teamId !== session.teamId) {
    return NextResponse.json({ error: 'That isn’t the team you’re signed in to.' }, { status: 403 })
  }

  const players = (await db`
    SELECT u.id
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ${session.teamId}
      AND u.roster_pending = true
      AND u.password_hash IS NULL
      AND NULLIF(TRIM(u.email), '') IS NOT NULL
    ORDER BY tm.joined_at
  `) as unknown as Array<{ id: string }>
  if (players.length === 0) {
    return NextResponse.json({ ok: true, total: 0, sent: 0, skipped: { rateLimited: 0, failed: 0, alreadySetUp: 0 } })
  }

  const limit = await rateLimit(`player-setup-all:${session.teamId}`, 5, 3600)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Setup emails already went to this team a few times in the last hour. Try again later.' },
      { status: 429 },
    )
  }

  const addedBy = await coachDisplayName(session.teamId, session.adminEmail)
  let sent = 0
  const skipped = { rateLimited: 0, failed: 0, alreadySetUp: 0 }
  for (const p of players) {
    const out = await resendPlayerSetup(p.id, { teamId: session.teamId, addedBy })
    if (out.ok) sent++
    else if (out.reason === 'rate_limited') skipped.rateLimited++
    else if (out.reason === 'not_pending') skipped.alreadySetUp++
    else skipped.failed++
  }
  return NextResponse.json({ ok: true, total: players.length, sent, skipped })
}
