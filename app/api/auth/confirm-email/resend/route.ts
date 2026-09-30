import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { sendEntitlementConfirmation } from '@/lib/email-entitlements'

/**
 * Re-sends the activation link for the signed-in player's pending comp.
 * Always to the account's own address; 3 an hour per account (enforced inside
 * sendEntitlementConfirmation, shared with every other sender).
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session?.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const outcome = await sendEntitlementConfirmation(session.userId)
  switch (outcome) {
    case 'applied':
      return NextResponse.json({ success: true, activated: true })
    case 'confirm_sent':
    case 'setup_sent':
      return NextResponse.json({ success: true, sent: true })
    case 'nothing_pending':
      return NextResponse.json({ success: true, sent: false, pendingEntitlement: false })
    case 'rate_limited':
      return NextResponse.json(
        { error: 'We already sent a few links this hour — check your inbox (and spam folder).' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      )
    case 'no_account':
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    default:
      return NextResponse.json({ error: 'Could not send the email. Please try again later.' }, { status: 502 })
  }
}
