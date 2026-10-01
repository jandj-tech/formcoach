import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Lets a team's head coach remove an added coach (or cancel a pending invite)
// from their own team — the coach-side twin of app/api/org/remove-coach.
// Deleting the team_coaches row is what revokes access: every team session is
// re-checked against the database on each request (lib/team-auth.ts).
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { coachId?: unknown }
  if (typeof body.coachId !== 'string' || !UUID_RE.test(body.coachId)) {
    return NextResponse.json({ error: 'Missing coachId' }, { status: 400 })
  }

  // Head coach only — an assistant can't remove other coaches.
  const me = session.adminEmail.toLowerCase().trim()
  const [team] = (await db`
    SELECT admin_email FROM teams WHERE id = ${session.teamId}
  `) as unknown as [{ admin_email: string } | undefined]
  if (!team || team.admin_email.toLowerCase().trim() !== me) {
    return NextResponse.json({ error: 'Only the head coach can remove coaches from this team.' }, { status: 403 })
  }

  // Only an added coach on THIS team, and never the head coach's own row (the
  // head role itself lives on teams.admin_email and is changed by the org).
  const rows = (await db`
    DELETE FROM team_coaches
    WHERE id = ${body.coachId}
      AND team_id = ${session.teamId}
      AND LOWER(TRIM(email)) <> ${me}
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'That coach isn’t on this team any more. Refresh the page to see the current list.' },
      { status: 404 },
    )
  }

  return NextResponse.json({ removed: true })
}
