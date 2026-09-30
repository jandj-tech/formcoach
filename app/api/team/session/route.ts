import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest, switchableTeams } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const [team] = await db`
    SELECT id, name, admin_email, access_code, credits
    FROM teams WHERE id = ${session.teamId}
  ` as unknown as [{ id: string; name: string; admin_email: string; access_code: string; credits: number } | undefined]

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  // Every team this session's email may coach, for the app's team switcher:
  // POST /api/team/select { teamId } with this Bearer token returns a token
  // for any of them. The current team is always included (the session was
  // just re-checked against it), even if the list query came back short.
  // Only teams /api/team/select would actually switch this session into.
  const coached = await switchableTeams(session, await getOrgSessionFromRequest(req)).catch(() => [])
  const teams = coached.map((t) => ({ id: t.id, name: t.name, role: t.role }))
  if (!teams.some((t) => t.id === team.id)) {
    const role = team.admin_email.toLowerCase() === session.adminEmail.toLowerCase() ? 'head' : 'assistant'
    teams.unshift({ id: team.id, name: team.name, role })
  }

  return NextResponse.json({
    teamId: team.id,
    name: team.name,
    adminEmail: team.admin_email,
    accessCode: team.access_code,
    credits: team.credits,
    currentTeamId: team.id,
    teams,
  })
}
