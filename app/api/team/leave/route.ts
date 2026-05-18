import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

// Leaves a single team. A player can be on several teams, so the team to
// leave must be specified.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: string }
    if (!teamId) {
      return NextResponse.json({ error: 'Team is required' }, { status: 400 })
    }

    await db`
      DELETE FROM team_memberships
      WHERE user_id = ${session.userId} AND team_id = ${teamId}
    `

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Team leave error:', err)
    return NextResponse.json({ error: 'Failed to leave team' }, { status: 500 })
  }
}
