import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { issuePlayerSetupToken } from '@/lib/roster-players'
import { sendPlayerSetupEmail } from '@/lib/email'

// Re-sends the account-setup email to a roster-pending player on the coach's
// own team.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string }
  if (!userId) return NextResponse.json({ error: 'Player is required' }, { status: 400 })

  const [row] = (await db`
    SELECT u.id, u.email, u.parent_name, t.name AS team_name
    FROM users u
    JOIN team_memberships tm ON tm.user_id = u.id
    JOIN teams t ON t.id = tm.team_id
    WHERE u.id = ${userId} AND u.roster_pending = true AND tm.team_id = ${session.teamId}
    LIMIT 1
  `) as unknown as [{ id: string; email: string; parent_name: string | null; team_name: string } | undefined]

  if (!row) return NextResponse.json({ error: 'No pending player found on this team.' }, { status: 404 })

  const setupUrl = await issuePlayerSetupToken(row.id)
  if (!setupUrl) return NextResponse.json({ error: 'This player has already finished setup.' }, { status: 409 })

  try {
    await sendPlayerSetupEmail(row.email, row.team_name, setupUrl, row.parent_name)
  } catch (err) {
    console.error('team resend setup email failed:', err)
    return NextResponse.json({ error: 'Could not send the email. Try again shortly.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, emailedTo: row.email })
}
