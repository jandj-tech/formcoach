import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  if (!email) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  await db`
    UPDATE email_list
    SET unsubscribed_at = NOW()
    WHERE email = ${email.toLowerCase().trim()}
    AND unsubscribed_at IS NULL
  `

  return NextResponse.redirect(new URL('/unsubscribed', req.url))
}
