import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { deleteOffer, getOfferById, getOrgSellingState, updateOffer } from '@/lib/org-offers-db'
import { parseOfferInput } from '@/lib/org-offer-input'

// Edit or remove one of the org's offers. Turning an offer ON requires an
// entitled org whose selling hasn't been paused.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    if (!(await orgIsEntitledById(session.orgId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }
    const { id } = await ctx.params
    const existing = await getOfferById(id)
    if (!existing || existing.orgId !== session.orgId) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const parsed = parseOfferInput(body, existing)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
    if (parsed.value.joinTeamId) {
      const [t] = await db`SELECT 1 FROM teams WHERE id = ${parsed.value.joinTeamId} AND organization_id = ${session.orgId}`
      if (!t) return NextResponse.json({ error: 'That team is not in your organization' }, { status: 400 })
    }

    let active: boolean | undefined
    if (typeof body.active === 'boolean') {
      if (body.active) {
        const selling = await getOrgSellingState(session.orgId)
        if (!selling.enabled) {
          return NextResponse.json(
            {
              error: selling.disabled
                ? 'Selling is paused for your organization — contact support@learnhoops.com.'
                : 'Selling needs an active organization plan.',
              sellingDisabled: true,
            },
            { status: 403 }
          )
        }
      }
      active = body.active
    }

    const offer = await updateOffer(id, parsed.value, { active })
    return NextResponse.json({ success: true, offer })
  } catch (err) {
    console.error('[org/offers/:id] PATCH failed:', err)
    return NextResponse.json({ error: 'Could not save the offer' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const { id } = await ctx.params
    const existing = await getOfferById(id)
    if (!existing || existing.orgId !== session.orgId) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }
    await deleteOffer(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[org/offers/:id] DELETE failed:', err)
    return NextResponse.json({ error: 'Could not delete the offer' }, { status: 500 })
  }
}
