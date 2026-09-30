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
  const rows = (await db`
    DELETE FROM team_coaches
    WHERE id = ${body.coachId}
      AND team_id IN (SELECT id FROM teams WHERE organization_id = ${session.orgId})
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'That coach isn’t on any of your teams any more. Refresh the page to see the current list.' },
      { status: 404 },
    )
  }

  return NextResponse.json({ removed: true })
}
