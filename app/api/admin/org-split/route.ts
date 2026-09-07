import { NextRequest, NextResponse } from 'next/server'
import { isAdminSession } from '@/lib/admin-auth'
import { parseSharePercent } from '@/lib/org-offers'
import { setOrgSellingDisabled, setOrgSplit } from '@/lib/org-offers-db'

// Per-org selling controls: a percent override (null = platform default) and
// the pause switch (pausing also turns every offer off).
export async function PATCH(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = (await req.json().catch(() => ({}))) as {
      orgId?: unknown
      platformSharePercent?: unknown
      sellingDisabled?: unknown
    }
    const orgId = typeof body.orgId === 'string' ? body.orgId : ''
    if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 })
    let pct: number | null | undefined
    if ('platformSharePercent' in body) {
      if (body.platformSharePercent === null || body.platformSharePercent === '') {
        pct = null
      } else {
        pct = parseSharePercent(body.platformSharePercent)
        if (pct === null) return NextResponse.json({ error: 'Percent must be between 0 and 100' }, { status: 400 })
        pct = Math.round(pct * 100) / 100
      }
      await setOrgSplit(orgId, pct)
    }
    if (typeof body.sellingDisabled === 'boolean') {
      await setOrgSellingDisabled(orgId, body.sellingDisabled)
    }
    return NextResponse.json({ success: true, platformSharePercent: pct, sellingDisabled: body.sellingDisabled })
  } catch (err) {
    console.error('[admin/org-split] failed:', err)
    return NextResponse.json({ error: 'Could not update the split' }, { status: 500 })
  }
}
