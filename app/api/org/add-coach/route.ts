import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { currentOrgCredentialHash, getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { addCoachToTeam, AddCoachError } from '@/lib/roster-players'
import { cleanOptionalDisplayText } from '@/lib/moderation'

// Adds a coach to one of the org's teams. Two modes:
//  - email: a new coach gets an invite token (and optionally the email); a
//    coach who already has a coach password is added straight away, keeps
//    that password, and gets a "you've been added" notice
//  - self: the org owner adds themselves as a coach, no separate account
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // A lapsed organization keeps what it has but cannot grow. Deleting,
  // renaming and moving tokens around all still work — see
  // lib/team-features.ts.
  if (!(await orgIsEntitledById(session.orgId))) {
    return NextResponse.json(
      { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
      { status: 402 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    teamId?: string
    email?: string
    sendEmail?: boolean
    self?: boolean
    name?: string
  }
  if (!body.teamId) {
    return NextResponse.json({ error: 'Team is required' }, { status: 400 })
  }
  const name = cleanOptionalDisplayText(body.name, 100)
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 })

  try {
    // Verify the team belongs to this organization.
    const [team] = (await db`
      SELECT id, name, admin_email FROM teams
      WHERE id = ${body.teamId} AND organization_id = ${session.orgId}
    `) as unknown as [{ id: string; name: string; admin_email: string } | undefined]
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // --- Self: the org owner adds themselves as a coach (no invite) ---
    if (body.self) {
      const selfEmail = session.adminEmail.toLowerCase().trim()

      if (team.admin_email.toLowerCase() === selfEmail) {
        return NextResponse.json({ error: "You're already this team's head coach." }, { status: 409 })
      }
      const [dup] = (await db`
        SELECT id FROM team_coaches WHERE team_id = ${team.id} AND email = ${selfEmail}
      `) as unknown as [{ id: string } | undefined]
      if (dup) {
        return NextResponse.json({ error: "You're already a coach of this team." }, { status: 409 })
      }

      const nickname = name.value
      // Reuse this login's password (owner or linked admin) so the entry
      // isn't flagged "invite pending".
      const hash = await currentOrgCredentialHash(session)

      await db`
        INSERT INTO team_coaches (team_id, email, password_hash, nickname)
        VALUES (${team.id}, ${selfEmail}, ${hash}, ${nickname})
      `
      return NextResponse.json({ self: true })
    }

    // --- Email: invite a new coach, or add an existing coach to this team ---
    const [org] = (await db`
      SELECT name FROM organizations WHERE id = ${session.orgId}
    `) as unknown as [{ name: string } | undefined]
    const result = await addCoachToTeam({
      team: { id: team.id, name: team.name, adminEmail: team.admin_email, orgName: org?.name ?? null },
      email: body.email ?? '',
      nickname: name.value,
      sendEmail: !!body.sendEmail,
      addedBy: org?.name ?? null,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AddCoachError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (/relation .*team_coaches.* does not exist|team_coaches.* does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'The multi-coach feature needs a database update — run `npm run migrate`.' },
        { status: 503 },
      )
    }
    console.error('org add-coach error:', err)
    return NextResponse.json({ error: 'Failed to add coach' }, { status: 500 })
  }
}
