import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'

// Lets a logged-in coach add another coach to their team. Returns an invite
// token; the dashboard turns it into a coach signup link to share.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { email?: string }
  const email = body.email?.toLowerCase().trim()
  if (!email) return NextResponse.json({ error: 'Coach email is required' }, { status: 400 })

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

  return NextResponse.json({ inviteToken })
}
