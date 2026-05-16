import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { sendCoachSignupEmail } from '@/lib/email'

// Lets an org admin add a coach to one of their teams. Always returns an
// invite token (for a shareable link); optionally emails the signup link too.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    teamId?: string
    email?: string
    sendEmail?: boolean
  }
  const email = body.email?.toLowerCase().trim()
  if (!body.teamId || !email) {
    return NextResponse.json({ error: 'Team and coach email are required' }, { status: 400 })
  }

  try {
    // Verify the team belongs to this organization.
    const [team] = (await db`
      SELECT id, name FROM teams WHERE id = ${body.teamId} AND organization_id = ${session.orgId}
    `) as unknown as [{ id: string; name: string } | undefined]
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

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
