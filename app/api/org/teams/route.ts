import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Lists the org's teams — used by the cart so an org can pick which team's
// pool receives the free analyses from a ball purchase.
export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const teams = (await db`
      SELECT id, name FROM teams
      WHERE organization_id = ${session.orgId}
      ORDER BY created_at ASC
    `) as unknown as Array<{ id: string; name: string }>
    return NextResponse.json({ teams })
  } catch (err) {
    console.error('Org teams list error:', err)
    return NextResponse.json({ error: 'Could not load teams' }, { status: 500 })
  }
}
