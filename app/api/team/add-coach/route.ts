import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { sendCoachSignupEmail } from '@/lib/email'

// Lets a logged-in coach add another coach to their team. Always returns an
// invite token (for a shareable link); optionally emails the signup link too.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { email?: string; sendEmail?: boolean }
  const email = body.email?.toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'Coach email is required' }, { status: 400 })

  try {
    const [existing] = (await db`
      SELECT id FROM team_coaches WHERE email = ${email}
    `) as unknown as [{ id: string } | undefined]
    if (existing) {
      return NextResponse.json({ error: 'That email is already a coach.' }, { status: 409 })
    }

    const inviteToken = crypto.randomBytes(32).toString('hex')
    await db`
      INSERT INTO team_coaches (team_id, email, invite_token)
      VALUES (${session.teamId}, ${email}, ${inviteToken})
    `

    // Optionally email the signup link. The coach is created either way, so a
    // failed email is non-fatal — the dashboard falls back to showing the link.
    let emailed = false
    if (body.sendEmail) {
      try {
        const [team] = (await db`
          SELECT name FROM teams WHERE id = ${session.teamId}
        `) as unknown as [{ name: string } | undefined]
        await sendCoachSignupEmail(email, team?.name ?? 'your team', inviteToken)
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
    console.error('add-coach error:', err)
    return NextResponse.json({ error: 'Failed to add coach' }, { status: 500 })
  }
}
