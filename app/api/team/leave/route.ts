import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'
import { releaseSeatIfLeftOrg } from '@/lib/org-membership'

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

    const left = (await db`
      DELETE FROM team_memberships m
      USING teams t
      WHERE m.user_id = ${session.userId} AND m.team_id = ${teamId} AND t.id = m.team_id
      RETURNING t.organization_id
    `) as unknown as Array<{ organization_id: string | null }>

    // Leaving the last team of an org gives back that org's membership seat.
    if (left[0]?.organization_id) await releaseSeatIfLeftOrg(session.userId, left[0].organization_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Team leave error:', err)
    return NextResponse.json({ error: 'Failed to leave team' }, { status: 500 })
  }
}
