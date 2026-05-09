import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const criteria = await db`
    SELECT * FROM criteria ORDER BY order_index, id
  `
  return NextResponse.json(criteria)
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { action, id, name, description, weight, order_index, active } = body

  if (action === 'create') {
    const [maxOrder] = await db`SELECT COALESCE(MAX(order_index), 0) as max FROM criteria`
    const [created] = await db`
      INSERT INTO criteria (name, description, weight, order_index, active)
      VALUES (${name}, ${description || ''}, ${weight || 1.0}, ${(maxOrder.max as number) + 1}, true)
      RETURNING *
    `
    return NextResponse.json(created)
  }

  if (action === 'update') {
    const [updated] = await db`
      UPDATE criteria
      SET name = ${name}, description = ${description}, weight = ${weight},
          order_index = ${order_index}, active = ${active}
      WHERE id = ${id}
      RETURNING *
    `
    return NextResponse.json(updated)
  }

  if (action === 'delete') {
    await db`DELETE FROM criteria WHERE id = ${id}`
    return NextResponse.json({ success: true })
  }

  if (action === 'reorder') {
    const { items } = body as { items: { id: number; order_index: number }[] }
    for (const item of items) {
      await db`UPDATE criteria SET order_index = ${item.order_index} WHERE id = ${item.id}`
    }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
