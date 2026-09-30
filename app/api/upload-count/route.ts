import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'

/**
 * The signed-in player's own token balance and subscription state.
 *
 * This used to take `?email=` and answer for ANY address, with no session and
 * no rate limit — an oracle that told an anonymous caller whether a given email
 * had an account, whether it was subscribed, and how many analysis tokens it
 * held. Nothing in the web app calls it; the shape predates real accounts.
 *
 * Rather than delete a route the iOS app may still hit, it now answers only for
 * the caller. The `email` query parameter is ignored — a client cannot ask
 * about someone else.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session?.email || !session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // email_list is keyed on an address, and anyone can register any address —
  // so the comp or token balance parked there is only reported to an account
  // that has proven it owns the inbox (users.email_verified_at). An unproven
  // account sees nothing from email_list.
  const [user] = (await db`
    SELECT email, email_verified_at FROM users WHERE id = ${session.userId}
  `) as unknown as [{ email: string; email_verified_at: string | null } | undefined]
  if (!user?.email_verified_at) {
    return NextResponse.json({ tokens: 0, subscribed: false })
  }

  const email = user.email.toLowerCase().trim()

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
