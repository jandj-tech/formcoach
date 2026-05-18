import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Assigns tokens from the organization's own balance to selected players on
// any of the org's teams.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { playerUserIds, tokensEach } = await req.json()

    const ids = Array.isArray(playerUserIds)
      ? playerUserIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
      : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }

    const each = typeof tokensEach === 'number' ? Math.floor(tokensEach) : 1
    if (each < 1) {
      return NextResponse.json({ error: 'Invalid token amount' }, { status: 400 })
    }

    // Every recipient must be a player on one of this org's teams.
    const members = (await db`
      SELECT DISTINCT tm.user_id FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE t.organization_id = ${session.orgId} AND tm.user_id = ANY(${ids})
    `) as unknown as Array<{ user_id: string }>
    if (members.length !== ids.length) {
      return NextResponse.json(
        { error: 'Some selected players are not in your organization' },
        { status: 400 },
      )
    }

    const total = ids.length * each

    // Deduct from the org balance and credit players atomically. The
    // conditional UPDATE matches no row if the balance is short.
    const remaining = await db.begin(async (sql) => {
      const updated = (await sql`
        UPDATE organizations SET token_balance = token_balance - ${total}
        WHERE id = ${session.orgId} AND COALESCE(token_balance, 0) >= ${total}
        RETURNING token_balance
      `) as unknown as Array<{ token_balance: number }>
      if (updated.length === 0) return null
      for (const uid of ids) {
        await sql`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${each} WHERE id = ${uid}`
      }
      return updated[0].token_balance
    })

    if (remaining === null) {
      return NextResponse.json({ error: 'Not enough tokens in your balance' }, { status: 400 })
    }

    return NextResponse.json({ success: true, tokenBalance: remaining })
  } catch (err) {
    console.error('Org assign-balance-tokens error:', err)
    return NextResponse.json({ error: 'Could not assign tokens' }, { status: 500 })
  }
}
