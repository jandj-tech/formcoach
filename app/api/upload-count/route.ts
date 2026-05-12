import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const FREE_LIMIT = 3

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim()
  if (!email) return NextResponse.json({ used: 0, remaining: FREE_LIMIT, subscribed: false })

  const [emailRow] = await db`
    SELECT subscription_type, subscription_expires_at FROM email_list WHERE email = ${email}
  `
  const subscribed =
    !!emailRow?.subscription_type &&
    !!emailRow?.subscription_expires_at &&
    new Date(emailRow.subscription_expires_at) > new Date()

  if (subscribed) {
    return NextResponse.json({ used: 0, remaining: null, subscribed: true })
  }

  const [{ count }] = await db`
    SELECT COUNT(*)::int AS count FROM submissions
    WHERE email = ${email} AND created_at >= date_trunc('month', NOW())
  ` as unknown as [{ count: number }]

  const used = count ?? 0
  const remaining = Math.max(0, FREE_LIMIT - used)

  return NextResponse.json({ used, remaining, subscribed: false })
}
