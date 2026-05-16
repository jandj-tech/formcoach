import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { sendCoachSignupEmail } from '@/lib/email'

// Adds a coach to one of the org's teams. Two modes:
//  - email invite: returns an invite token (and optionally emails it)
//  - self: the org owner adds themselves as a coach, no separate account
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

      const nickname =
        typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 100) : null
      // Reuse the org's password so the entry isn't flagged "invite pending".
      const [org] = (await db`
        SELECT password_hash FROM organizations WHERE id = ${session.orgId}
      `) as unknown as [{ password_hash: string } | undefined]

      await db`
        INSERT INTO team_coaches (team_id, email, password_hash, nickname)
        VALUES (${team.id}, ${selfEmail}, ${org?.password_hash ?? null}, ${nickname})
      `
      return NextResponse.json({ self: true })
    }

    // --- Email invite flow ---
    const email = body.email?.toLowerCase().trim()
    if (!email) {
      return NextResponse.json({ error: 'Coach email is required' }, { status: 400 })
    }

    const [existing] = (await db`
      SELECT id FROM team_coaches WHERE email = ${email}
    `) as unknown as [{ id: string } | undefined]
    if (existing) {
      return NextResponse.json({ error: 'That email is already a coach.' }, { status: 409 })
    }

    const inviteToken = crypto.randomBytes(32).toString('hex')
    await db`
      INSERT INTO team_coaches (team_id, email, invite_token)
      VALUES (${team.id}, ${email}, ${inviteToken})
    `

    let emailed = false
    if (body.sendEmail) {
      try {
        await sendCoachSignupEmail(email, team.name, inviteToken)
        emailed = true
      } catch (err) {
        console.error('Coach invite email failed:', err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ inviteToken, emailed })
  } catch (err) {
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
