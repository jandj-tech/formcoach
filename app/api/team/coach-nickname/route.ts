import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'

// Lets the logged-in coach set their own display name. Stored on teams
// (for the head coach) or team_coaches (for additional coaches).
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { nickname?: string }
  const nickname = body.nickname?.trim().slice(0, 100) || null

  try {
    const [team] = (await db`
      SELECT admin_email FROM teams WHERE id = ${session.teamId}
    `) as unknown as [{ admin_email: string } | undefined]

    if (team && team.admin_email === session.adminEmail) {
      await db`UPDATE teams SET coach_nickname = ${nickname} WHERE id = ${session.teamId}`
    } else {
      await db`
        UPDATE team_coaches SET nickname = ${nickname}
        WHERE team_id = ${session.teamId} AND email = ${session.adminEmail}
      `
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/column .* does not exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'Coach names need a database update — run `npm run migrate`.' },
        { status: 503 },
      )
    }
    console.error('coach-nickname error:', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ nickname })
}
