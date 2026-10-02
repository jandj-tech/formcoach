import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { teamIsEntitled, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import {
  importPlayersToTeam,
  importNameMatches,
  getTeamContext,
  coachDisplayName,
  MAX_IMPORT_ROWS,
  type ImportRowInput,
} from '@/lib/roster-players'
import { importEmailRowCheck } from '@/lib/roster-import-check'

// Coach bulk-adds a CSV's players to their own team. Same per-row path as a
// single add (lib/roster-players), so dedupe-by-email, sibling handling and
// setup emails behave identically.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  if (!(await teamIsEntitled(session.teamId))) {
    return NextResponse.json(
      { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
      { status: 402 },
    )
  }

  // `check`: preview only — which name-only rows are already on the team
  // (the import skips them unless told to add anyway), which email rows are
  // (always skipped), and the same-name notes the import would add. Adds nothing.
  const body = (await req.json().catch(() => ({}))) as { rows?: ImportRowInput[]; sendEmail?: boolean; check?: boolean }
  if (body.check) {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_IMPORT_ROWS) : []
    return NextResponse.json({
      matches: await importNameMatches(session.teamId, rows),
      ...(await importEmailRowCheck(session.teamId, rows)),
    })
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'There are no players to import.' }, { status: 400 })
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `Please import at most ${MAX_IMPORT_ROWS} players at a time.` }, { status: 400 })
  }

  const team = await getTeamContext(session.teamId)
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const out = await importPlayersToTeam(team, body.rows, {
    sendEmail: body.sendEmail ?? true,
    addedBy: (await coachDisplayName(team.id, session.adminEmail)) ?? team.orgName,
  })
  return NextResponse.json({ ...out, teamId: team.id, teamName: team.name })
}
