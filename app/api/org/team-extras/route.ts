import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { resolveBaseUrl } from '@/lib/base-url'

// Extra roster details the org team card loads when it opens: whether the head
// coach has finished setting up, and the join link for each name-only player
// (so the org can share it, like the coach dashboard does). Kept out of the
// dashboard page query so the whole org page doesn't carry every invite token.
export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  const [team] = (await db`
    SELECT t.id, t.admin_email, (t.password_hash IS NULL) AS no_password,
           (t.coach_invite_token IS NOT NULL) AS has_invite, o.admin_email AS org_email
    FROM teams t JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ${teamId} AND t.organization_id = ${session.orgId}
  `) as unknown as [{
    id: string
    admin_email: string
    no_password: boolean
    has_invite: boolean
    org_email: string
  } | undefined]
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // 'org' = the organization coaches this team itself (no separate login).
  const headCoach: 'ready' | 'invite_sent' | 'org' =
    team.admin_email.toLowerCase() === team.org_email.toLowerCase() && team.no_password
      ? 'org'
      : team.no_password ? 'invite_sent' : 'ready'

  let pendingPlayers: Array<{ id: string; inviteUrl: string | null }> = []
  try {
    const rows = (await db`
      SELECT id, invite_token FROM pending_team_members WHERE team_id = ${team.id}
    `) as unknown as Array<{ id: string; invite_token: string | null }>
    const base = resolveBaseUrl()
    pendingPlayers = rows.map(r => ({
      id: r.id,
      inviteUrl: r.invite_token ? `${base}/signup?teamInvite=${r.invite_token}` : null,
    }))
  } catch {
    // pending_team_members may not exist on an old schema
  }

  return NextResponse.json({ headCoach, pendingPlayers })
}
