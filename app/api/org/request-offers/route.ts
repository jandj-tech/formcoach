import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { getOrgSellingState, requestSelling } from '@/lib/org-offers-db'
import { sendOffersRequestedEmail } from '@/lib/email'

// The org asks to sell offers. LearnHoops replies with a quoted revenue split
// and sets it in the admin dashboard, which enables activation.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    if (!(await orgIsEntitledById(session.orgId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }
    const before = await getOrgSellingState(session.orgId)
    if (before.enabled) return NextResponse.json({ success: true, alreadyEnabled: true })
    await requestSelling(session.orgId)
    if (!before.offersRequestedAt) {
      const [org] = (await db`SELECT name FROM organizations WHERE id = ${session.orgId}`) as unknown as [{ name: string } | undefined]
      await sendOffersRequestedEmail(org?.name ?? 'An organization', session.adminEmail, session.orgId)
    }
    return NextResponse.json({ success: true, requested: true })
  } catch (err) {
    console.error('[org/request-offers] failed:', err)
    return NextResponse.json({ error: 'Could not send the request' }, { status: 500 })
  }
}
