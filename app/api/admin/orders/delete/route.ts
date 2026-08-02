import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

// Permanently delete orders (e.g. test purchases). Rows in `orders` are the
// shipping queue only — deleting one never touches granted credits/tokens.
export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderIds } = await req.json() as { orderIds: string[] }
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds required' }, { status: 400 })
  }

  const deleted = await db`
    DELETE FROM orders WHERE id = ANY(${orderIds}::uuid[])
    RETURNING id
  ` as unknown as Array<{ id: string }>

  return NextResponse.json({ success: true, deleted: deleted.length })
}
