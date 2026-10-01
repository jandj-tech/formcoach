import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { orgHasComplimentaryAccess } from '@/lib/org-complimentary'

// Moves tokens from the organization's balance into a chosen coach's credit
// balance. The coach can then assign them to players or use them for their
// own uploads.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // The web Tokens panel and the app both send { coachEmail, quantity };
    // { email, amount } is accepted too so a picker built on the
    // /api/org/teams coach list can send its fields as-is.
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const email = String(body.coachEmail || body.email || '').toLowerCase().trim()
    const rawQty = body.quantity ?? body.amount
    const qty = typeof rawQty === 'number' && Number.isFinite(rawQty) ? Math.floor(rawQty) : 0
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

    // A complimentary org (lib/org-complimentary.ts) sends without a balance:
    // the coach is credited, nothing is debited. Everyone else pays from the
    // org balance.
    const complimentary = await orgHasComplimentaryAccess(session.orgId)

    // Deduct from the org balance and credit the coach atomically.
    const result = await db.begin(async (sql) => {
      const updated = complimentary
        ? ((await sql`
            SELECT COALESCE(token_balance, 0)::int AS token_balance FROM organizations WHERE id = ${session.orgId}
          `) as unknown as Array<{ token_balance: number }>)
        : ((await sql`
            UPDATE organizations SET token_balance = token_balance - ${qty}
            WHERE id = ${session.orgId} AND COALESCE(token_balance, 0) >= ${qty}
            RETURNING token_balance
          `) as unknown as Array<{ token_balance: number }>)
      if (updated.length === 0) return null
      const [coach] = (await sql`
        INSERT INTO coach_credits (email, credits) VALUES (${email}, ${qty})
        ON CONFLICT (email) DO UPDATE SET credits = coach_credits.credits + ${qty}
        RETURNING credits
      `) as unknown as [{ credits: number }]
      return { tokenBalance: updated[0].token_balance, coachCredits: coach.credits }
    })

    if (result === null) {
      return NextResponse.json({ error: 'Not enough organization tokens' }, { status: 400 })
    }

    // tokenBalance = the org's remaining tokens; coachCredits = that coach's new
    // personal balance (additive — older clients read only tokenBalance).
    return NextResponse.json({ success: true, tokenBalance: result.tokenBalance, coachCredits: result.coachCredits, coachEmail: email })
  } catch (err) {
    console.error('Org give-coach-credits error:', err)
    return NextResponse.json({ error: 'Could not give tokens' }, { status: 500 })
  }
}
