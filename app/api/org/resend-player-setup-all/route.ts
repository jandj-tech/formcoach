import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { resendPlayerSetup } from '@/lib/roster-players'
import { rateLimit } from '@/lib/rate-limit'

// One email per player, sent one after another; a big roster takes a while.
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Emails the "finish setting up your account" link to every player on one of
// the org's teams who was added with an email and hasn't set a password yet.
// Each send goes through resendPlayerSetup, so the per-player limit (3 an
// hour) still applies; the team itself is limited too, so the button can't be
// used to spam a roster. Links go to each player's inbox only — never back here.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: string }
  if (!teamId || !UUID_RE.test(teamId)) return NextResponse.json({ error: 'Team is required' }, { status: 400 })

  const [team] = (await db`
    SELECT id FROM teams WHERE id = ${teamId} AND organization_id = ${session.orgId}
  `) as unknown as [{ id: string } | undefined]
  if (!team) return NextResponse.json({ error: 'That team isn’t one of yours.' }, { status: 404 })

  const players = (await db`
    SELECT u.id
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ${teamId}
      AND u.roster_pending = true
      AND u.password_hash IS NULL
      AND NULLIF(TRIM(u.email), '') IS NOT NULL
    ORDER BY tm.joined_at
  `) as unknown as Array<{ id: string }>
  if (players.length === 0) {
    return NextResponse.json({ ok: true, total: 0, sent: 0, skipped: { rateLimited: 0, failed: 0, alreadySetUp: 0 } })
  }

  const limit = await rateLimit(`player-setup-all:${teamId}`, 5, 3600)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Setup emails already went to this team a few times in the last hour. Try again later.' },
      { status: 429 },
    )
  }

  let sent = 0
  const skipped = { rateLimited: 0, failed: 0, alreadySetUp: 0 }
  for (const p of players) {
    const out = await resendPlayerSetup(p.id, { teamId })
    if (out.ok) sent++
    else if (out.reason === 'rate_limited') skipped.rateLimited++
    else if (out.reason === 'not_pending') skipped.alreadySetUp++
    else skipped.failed++
  }
  return NextResponse.json({ ok: true, total: players.length, sent, skipped })
}
