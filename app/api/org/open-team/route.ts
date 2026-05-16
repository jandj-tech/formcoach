import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { db } from '@/lib/db'

// Lets the org owner open one of their teams' coach dashboards: issues a
// team session for a team that belongs to the organization.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { teamId } = await req.json()
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const [team] = (await db`
      SELECT id, admin_email FROM teams
      WHERE id = ${teamId} AND organization_id = ${session.orgId}
    `) as unknown as [{ id: string; admin_email: string } | undefined]
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    // Sign with the org owner's email so the team dashboard shows them as the
    // viewer (resolving to their own coach name), not the team's head coach.
    const token = await signTeamSession({ teamId: team.id, adminEmail: session.adminEmail })
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Org open-team error:', err)
    return NextResponse.json({ error: 'Could not open team' }, { status: 500 })
  }
}
