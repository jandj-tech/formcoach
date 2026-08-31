import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'

// A coach on an org-linked team sends credits back to the organization's
// balance — the reverse of give-coach-credits / allocate-team-credits.
// Source is either the coach's personal credits or the team's shared credits.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { source, quantity } = await req.json()
    const from: 'personal' | 'team' = source === 'team' ? 'team' : 'personal'
    // Number.isFinite, not `typeof === 'number'`: NaN is a number, and
    // `NaN < 1` is false, so a NaN quantity slipped past the guard below and
    // only failed later inside the transaction. The balance check makes it
    // unexploitable, but money code should reject bad input at the door.
    const qty = Number.isFinite(quantity) ? Math.floor(quantity as number) : 0
    if (qty < 1) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // The team must belong to an organization to have somewhere to return to.
    const [team] = (await db`
      SELECT t.organization_id, o.name AS org_name
      FROM teams t
      LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = ${session.teamId}
    `) as unknown as [{ organization_id: string | null; org_name: string | null } | undefined]
    if (!team?.organization_id) {
      return NextResponse.json({ error: 'This team is not linked to an organization' }, { status: 400 })
    }

    const coachEmail = session.adminEmail.toLowerCase()

    // Deduct from the chosen balance and credit the org atomically.
    const remaining = await db.begin(async (sql) => {
      const updated = (from === 'team'
        ? ((await sql`
            UPDATE teams SET credits = credits - ${qty}
            WHERE id = ${session.teamId} AND COALESCE(credits, 0) >= ${qty}
            RETURNING credits
          `) as unknown as Array<{ credits: number }>)
        : ((await sql`
            UPDATE coach_credits SET credits = credits - ${qty}
            WHERE email = ${coachEmail} AND credits >= ${qty}
            RETURNING credits
          `) as unknown as Array<{ credits: number }>))
      if (updated.length === 0) return null
      await sql`
        UPDATE organizations SET token_balance = COALESCE(token_balance, 0) + ${qty}
        WHERE id = ${team.organization_id}
      `
      return updated[0].credits
    })

    if (remaining === null) {
      return NextResponse.json(
        { error: from === 'team' ? 'Not enough team credits' : 'Not enough personal credits' },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, remaining, orgName: team.org_name })
  } catch (err) {
    console.error('Team return-credits error:', err)
    return NextResponse.json({ error: 'Could not return credits' }, { status: 500 })
  }
}
