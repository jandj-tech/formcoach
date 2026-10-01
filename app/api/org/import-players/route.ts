import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { importPlayersToTeam, importNameMatches, MAX_IMPORT_ROWS, type ImportRowInput } from '@/lib/roster-players'

export type { ImportRowInput }

// Bulk-adds a CSV's players to one team the org owns. The org-level
// multi-team import calls this once per team. Each row runs through the same
// add-player path as a single add (lib/roster-players), and every result
// carries the row number from the original file.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await orgIsEntitledById(session.orgId))) {
    return NextResponse.json(
      { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
      { status: 402 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    teamId?: string
    rows?: ImportRowInput[]
    sendEmail?: boolean
    /** Preview only: which name-only rows are already on the team. Adds nothing. */
    check?: boolean
  }
  if (!body.teamId) return NextResponse.json({ error: 'Pick a team to import into.' }, { status: 400 })
  if (body.check) return checkRows(session.orgId, body.teamId, body.rows)
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'There are no players to import.' }, { status: 400 })
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `Please import at most ${MAX_IMPORT_ROWS} players at a time.` }, { status: 400 })
  }

  const [team] = (await db`
    SELECT t.id, t.name, o.name AS org_name
    FROM teams t JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ${body.teamId} AND t.organization_id = ${session.orgId}
  `) as unknown as [{ id: string; name: string; org_name: string } | undefined]
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const out = await importPlayersToTeam(
    { id: team.id, name: team.name, orgName: team.org_name },
    body.rows,
    { sendEmail: body.sendEmail ?? true, addedBy: team.org_name },
  )
  return NextResponse.json({ ...out, teamId: team.id, teamName: team.name })
}

// The import preview's look-ahead for one team: the rows without an email
// whose name is already on that team (the import skips them unless told to
// add anyway), plus enough about the team to tell two same-named teams apart.
async function checkRows(orgId: string, teamId: string, rows: ImportRowInput[] | undefined) {
  const [team] = (await db`
    SELECT t.id, t.name, NULLIF(TRIM(t.coach_nickname), '') AS coach_nickname, t.admin_email,
           (SELECT COUNT(*)::int FROM team_memberships m WHERE m.team_id = t.id)
             + (SELECT COUNT(*)::int FROM pending_team_members p WHERE p.team_id = t.id) AS players
    FROM teams t
    WHERE t.id = ${teamId} AND t.organization_id = ${orgId}
  `) as unknown as [{ id: string; name: string; coach_nickname: string | null; admin_email: string | null; players: number } | undefined]
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  const list = Array.isArray(rows) ? rows.slice(0, MAX_IMPORT_ROWS) : []
  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    players: team.players,
    coach: team.coach_nickname ?? team.admin_email ?? null,
    matches: await importNameMatches(team.id, list),
  })
}
