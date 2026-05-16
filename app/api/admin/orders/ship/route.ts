import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import { sendShippingEmail } from '@/lib/email'

async function isAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderIds, shippingLink } = await req.json() as { orderIds: string[]; shippingLink?: string }
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: 'orderIds required' }, { status: 400 })
  }

  if (shippingLink) {
    await db`
      UPDATE orders SET status = 'shipped', shipping_link = ${shippingLink}
      WHERE id = ANY(${orderIds}::uuid[])
    `
  } else {
    await db`
      UPDATE orders SET status = 'shipped'
      WHERE id = ANY(${orderIds}::uuid[])
    `
  }

  if (shippingLink) {
    const orders = await db`
      SELECT email, customer_name FROM orders
      WHERE id = ANY(${orderIds}::uuid[])
    ` as unknown as { email: string; customer_name: string | null }[]

    await Promise.allSettled(
      orders.map(o => sendShippingEmail(o.email, o.customer_name, shippingLink))
    )
  }

  return NextResponse.json({ ok: true })
}
