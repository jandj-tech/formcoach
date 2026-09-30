import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { addPlayerToTeam, AddPlayerError } from '@/lib/roster-players'

// Org adds one player directly to a team it owns. No password required; if an
// email is given the player becomes a real (password-less) account whose setup
// link is emailed to that address only (see lib/roster-players).
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
    firstName?: string
    lastName?: string
    email?: string
    parentName?: string
    phone?: string
    sendEmail?: boolean
    allowDuplicateName?: boolean
  }
  if (!body.teamId) return NextResponse.json({ error: 'Pick a team first.' }, { status: 400 })

  const [team] = (await db`
    SELECT t.id, t.name, o.name AS org_name
    FROM teams t JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ${body.teamId} AND t.organization_id = ${session.orgId}
  `) as unknown as [{ id: string; name: string; org_name: string } | undefined]
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  try {
    const result = await addPlayerToTeam({
      teamId: team.id,
      firstName: body.firstName ?? '',
      lastName: body.lastName ?? null,
      email: body.email ?? null,
      parentName: body.parentName ?? null,
      phone: body.phone ?? null,
      sendEmail: body.sendEmail ?? true,
      teamName: team.name,
      orgName: team.org_name,
      addedBy: team.org_name,
      allowDuplicateName: !!body.allowDuplicateName,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AddPlayerError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('org add-player error:', err)
    return NextResponse.json({ error: 'Could not add the player. Please try again.' }, { status: 500 })
  }
}
