import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminSession } from '@/lib/admin-auth'

// Record a manual payout to an org (or a negative clawback adjustment).
export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = (await req.json().catch(() => ({}))) as {
      orgId?: unknown
      amountCents?: unknown
      currency?: unknown
      method?: unknown
      note?: unknown
    }
    const orgId = typeof body.orgId === 'string' ? body.orgId : ''
    const amount = Number(body.amountCents)
    const currency = typeof body.currency === 'string' ? body.currency.toLowerCase().slice(0, 10) : ''
    if (!orgId || !Number.isInteger(amount) || amount === 0 || !['usd', 'cad'].includes(currency)) {
      return NextResponse.json({ error: 'orgId, a non-zero whole-cent amount and a currency (usd/cad) are required' }, { status: 400 })
    }
    const method = typeof body.method === 'string' ? body.method.trim().slice(0, 50) || null : null
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null
    const [row] = (await db`
      INSERT INTO org_payouts (org_id, amount_cents, currency, method, note)
      VALUES (${orgId}, ${amount}, ${currency}, ${method}, ${note})
      RETURNING id
    `) as unknown as [{ id: string }]
    return NextResponse.json({ success: true, id: row.id })
  } catch (err) {
    console.error('[admin/org-payouts] failed:', err)
    return NextResponse.json({ error: 'Could not record the payout' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdminSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = req.nextUrl.searchParams.get('id') ?? ''
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await db`DELETE FROM org_payouts WHERE id = ${id}::uuid`
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/org-payouts] delete failed:', err)
    return NextResponse.json({ error: 'Could not delete the payout' }, { status: 500 })
  }
}
