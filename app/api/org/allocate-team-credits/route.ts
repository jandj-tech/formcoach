import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Moves credits from the org's general balance into a specific team's credit
// pool. Once in that pool the team's coach can spend them on coach uploads or
// assign them to players — but only within this team. The org can also still
// use them (via Open team dashboard or by assigning to players directly).
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { teamId, quantity } = await req.json()
    const tid = typeof teamId === 'string' ? teamId.trim() : ''
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 0
    if (!tid) {
      return NextResponse.json({ error: 'Team is required' }, { status: 400 })
    }
    if (qty < 1) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // The team must belong to this org.
    const teamRows = (await db`
      SELECT id FROM teams
      WHERE id = ${tid} AND organization_id = ${session.orgId}
      LIMIT 1
    `) as unknown as Array<{ id: string }>
    if (teamRows.length === 0) {
      return NextResponse.json({ error: 'That team is not in your organization' }, { status: 404 })
    }

    // Atomic: deduct from org balance, add to team credits.
    const result = await db.begin(async (sql) => {
      const updated = (await sql`
        UPDATE organizations SET token_balance = token_balance - ${qty}
        WHERE id = ${session.orgId} AND COALESCE(token_balance, 0) >= ${qty}
        RETURNING token_balance
      `) as unknown as Array<{ token_balance: number }>
      if (updated.length === 0) return null
      const [team] = (await sql`
        UPDATE teams
        SET credits = COALESCE(credits, 0) + ${qty}
        WHERE id = ${tid}
        RETURNING credits
      `) as unknown as Array<{ credits: number }>
      return { tokenBalance: updated[0].token_balance, teamCredits: team.credits }
    })

    if (result === null) {
      return NextResponse.json({ error: 'Not enough tokens in your balance' }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[org/allocate-team-credits] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not allocate credits' }, { status: 500 })
  }
}
