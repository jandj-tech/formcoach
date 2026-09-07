import { NextRequest, NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/admin-auth'
import { parseSharePercent } from '@/lib/org-offers'
import { setOrgSplit } from '@/lib/org-offers-db'

// The "quote": set an org's platform share to enable selling, or clear it
// (null) to disable — which also switches every offer off.
export async function PATCH(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = (await req.json().catch(() => ({}))) as { orgId?: unknown; platformSharePercent?: unknown }
    const orgId = typeof body.orgId === 'string' ? body.orgId : ''
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    let pct: number | null
    if (body.platformSharePercent === null || body.platformSharePercent === '') {
      pct = null
    } else {
      pct = parseSharePercent(body.platformSharePercent)
      if (pct === null) return NextResponse.json({ error: 'Percent must be between 0 and 100' }, { status: 400 })
      pct = Math.round(pct * 100) / 100
    }
    await setOrgSplit(orgId, pct)
    return NextResponse.json({ success: true, platformSharePercent: pct })
  } catch (err) {
    console.error('[admin/org-split] failed:', err)
    return NextResponse.json({ error: 'Could not update the split' }, { status: 500 })
  }
}
