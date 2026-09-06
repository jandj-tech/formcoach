import { NextRequest, NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/admin-auth'
import { orgRevenueOverview, orgSalesSummary } from '@/lib/org-sales'
import { getOrgOffers, getOrgResultSettings, getOrgSellingState } from '@/lib/org-offers-db'

// Site admin: every selling org at a glance, or one org in detail (?orgId=).
export async function GET(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const orgId = req.nextUrl.searchParams.get('orgId')
    if (orgId) {
      const [summary, offers, selling, settings] = await Promise.all([
        orgSalesSummary(orgId),
        getOrgOffers(orgId),
        getOrgSellingState(orgId),
        getOrgResultSettings(orgId),
      ])
      return NextResponse.json({ ...summary, offers, selling, settings })
    }
    return NextResponse.json({ orgs: await orgRevenueOverview() })
  } catch (err) {
    console.error('[admin/org-revenue] failed:', err)
    return NextResponse.json({ error: 'Could not load revenue' }, { status: 500 })
  }
}
