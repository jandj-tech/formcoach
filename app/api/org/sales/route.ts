import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgSalesSummary } from '@/lib/org-sales'

// Who paid, for what, and what the org is owed — per currency.
export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const summary = await orgSalesSummary(session.orgId)
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[org/sales] failed:', err)
    return NextResponse.json({ sales: [], payouts: [], totals: [] })
  }
}
