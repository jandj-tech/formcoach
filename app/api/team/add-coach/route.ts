import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { teamIsEntitled, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { addCoachToTeam, AddCoachError, coachDisplayName } from '@/lib/roster-players'
import { cleanOptionalDisplayText } from '@/lib/moderation'

// Lets a logged-in coach add another coach to their team. A new coach gets an
// invite token (for a shareable link) and optionally the signup email. A coach
// who already coaches another team is added straight away with the password
// they already use, and gets a "you've been added" notice instead.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await teamIsEntitled(session.teamId))) {
    return NextResponse.json(
      { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
      { status: 402 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string; sendEmail?: boolean; name?: string }
  const name = cleanOptionalDisplayText(body.name, 100)
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 })

  try {
    const [team] = (await db`
      SELECT t.id, t.name, t.admin_email, o.name AS org_name
      FROM teams t LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = ${session.teamId}
    `) as unknown as [{ id: string; name: string; admin_email: string; org_name: string | null } | undefined]
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const result = await addCoachToTeam({
      team: { id: team.id, name: team.name, adminEmail: team.admin_email, orgName: team.org_name },
      email: body.email ?? '',
      nickname: name.value,
      sendEmail: !!body.sendEmail,
      addedBy: await coachDisplayName(team.id, session.adminEmail),
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AddCoachError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (/relation .*team_coaches.* does not exist|team_coaches.* does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'The multi-coach feature needs a database update \u2014 run `npm run migrate`.' },
        { status: 503 },
      )
    }
    console.error('add-coach error:', err)
    return NextResponse.json({ error: 'Could not add the coach. Please try again.' }, { status: 500 })
  }
}
