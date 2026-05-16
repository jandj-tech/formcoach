import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Update a team's age group (org owner). An empty value clears it.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { teamId, ageGroup } = await req.json()
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const value =
      typeof ageGroup === 'string' && ageGroup.trim() ? ageGroup.trim().slice(0, 50) : null

    const [team] = (await db`
      SELECT id FROM teams WHERE id = ${teamId} AND organization_id = ${session.orgId}
    `) as unknown as [{ id: string } | undefined]
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    await db`UPDATE teams SET age_group = ${value} WHERE id = ${teamId}`
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Org update-team error:', err)
    return NextResponse.json({ error: 'Could not update team' }, { status: 500 })
  }
}
