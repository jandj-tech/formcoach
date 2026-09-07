import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { createOffer, ensureDefaultOffers, getOrgSellingState } from '@/lib/org-offers-db'
import { parseOfferInput } from '@/lib/org-offer-input'

// The offer builder's data: every offer (seeding the drafts on first visit),
// the selling state, and the org's teams for the class join-link picker.
export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const [offers, selling, teams] = await Promise.all([
      ensureDefaultOffers(session.orgId),
      getOrgSellingState(session.orgId),
      db`SELECT id, name FROM teams WHERE organization_id = ${session.orgId} ORDER BY name` as unknown as Promise<
        Array<{ id: string; name: string }>
      >,
    ])
    return NextResponse.json({
      orgId: session.orgId,
      offers,
      selling: {
        enabled: selling.enabled,
        entitled: selling.entitled,
        disabled: selling.disabled,
        platformSharePercent: selling.platformSharePercent,
      },
      teams,
    })
  } catch (err) {
    console.error('[org/offers] GET failed:', err)
    return NextResponse.json({ error: 'Could not load offers' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    if (!(await orgIsEntitledById(session.orgId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const parsed = parseOfferInput(body)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    if (parsed.value.joinTeamId) {
      const [t] = await db`SELECT 1 FROM teams WHERE id = ${parsed.value.joinTeamId} AND organization_id = ${session.orgId}`
      if (!t) return NextResponse.json({ error: 'That team is not in your organization' }, { status: 400 })
    }
    const count = (await db`SELECT COUNT(*)::int AS n FROM org_offers WHERE org_id = ${session.orgId}`) as unknown as [{ n: number }]
    if (count[0].n >= 12) return NextResponse.json({ error: 'You can have at most 12 offers' }, { status: 400 })
    const offer = await createOffer(session.orgId, parsed.value)
    return NextResponse.json({ success: true, offer })
  } catch (err) {
    console.error('[org/offers] POST failed:', err)
    return NextResponse.json({ error: 'Could not create the offer' }, { status: 500 })
  }
}
