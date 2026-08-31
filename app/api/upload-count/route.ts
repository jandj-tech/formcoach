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
  if (!session?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const email = session.email.toLowerCase().trim()

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
