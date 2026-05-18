import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Moves tokens from the organization's balance into a chosen coach's credit
// balance. The coach can then assign them to players or use them for their
// own uploads.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { coachEmail, quantity } = await req.json()
    const email = String(coachEmail || '').toLowerCase().trim()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 0
    if (!email) {
      return NextResponse.json({ error: 'Coach is required' }, { status: 400 })
    }
    if (qty < 1) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // The coach must be a founding or additional coach of a team in this org.
    const coachRows = (await db`
      SELECT 1 FROM teams t
      LEFT JOIN team_coaches tc ON tc.team_id = t.id
      WHERE t.organization_id = ${session.orgId}
        AND (LOWER(t.admin_email) = ${email} OR LOWER(tc.email) = ${email})
      LIMIT 1
    `) as unknown as unknown[]
    if (coachRows.length === 0) {
      return NextResponse.json({ error: 'That coach is not in your organization' }, { status: 404 })
    }

    // Deduct from the org balance and credit the coach atomically.
    const remaining = await db.begin(async (sql) => {
      const updated = (await sql`
        UPDATE organizations SET token_balance = token_balance - ${qty}
        WHERE id = ${session.orgId} AND COALESCE(token_balance, 0) >= ${qty}
        RETURNING token_balance
      `) as unknown as Array<{ token_balance: number }>
      if (updated.length === 0) return null
      await sql`
        INSERT INTO coach_credits (email, credits) VALUES (${email}, ${qty})
        ON CONFLICT (email) DO UPDATE SET credits = coach_credits.credits + ${qty}
      `
      return updated[0].token_balance
    })

    if (remaining === null) {
      return NextResponse.json({ error: 'Not enough tokens in your balance' }, { status: 400 })
    }

    return NextResponse.json({ success: true, tokenBalance: remaining })
  } catch (err) {
    console.error('Org give-coach-credits error:', err)
    return NextResponse.json({ error: 'Could not give credits' }, { status: 500 })
  }
}
