import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

// Lets an org admin remove a coach (or cancel a pending invite) from one of
// their organization's teams.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { coachId?: string }
  if (!body.coachId) return NextResponse.json({ error: 'Missing coachId' }, { status: 400 })

  // Only delete the coach if their team belongs to this organization.
  await db`
    DELETE FROM team_coaches
    WHERE id = ${body.coachId}
      AND team_id IN (SELECT id FROM teams WHERE organization_id = ${session.orgId})
  `

  return NextResponse.json({ removed: true })
}
