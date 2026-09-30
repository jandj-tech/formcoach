import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { cleanOptionalDisplayText } from '@/lib/moderation'

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

    // Same display-text rule as every other name save site (markup,
    // invisible characters, profanity); blank clears the age group.
    const cleaned = cleanOptionalDisplayText(ageGroup, 50)
    if (!cleaned.ok) {
      return NextResponse.json({ error: cleaned.error }, { status: 400 })
    }
    const value = cleaned.value

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
