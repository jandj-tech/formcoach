import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.toLowerCase().trim()
  if (!email) return NextResponse.json({ tokens: 0, subscribed: false })

  const [emailRow] = await db`
    SELECT subscription_type, subscription_expires_at, analysis_tokens
    FROM email_list WHERE email = ${email}
  `

  const subscribed =
    !!emailRow?.subscription_type &&
    !!emailRow?.subscription_expires_at &&
    new Date(emailRow.subscription_expires_at) > new Date()

  if (subscribed) {
    return NextResponse.json({ tokens: 0, subscribed: true })
  }

  const tokens: number = emailRow?.analysis_tokens ?? 0
  return NextResponse.json({ tokens, subscribed: false })
}
