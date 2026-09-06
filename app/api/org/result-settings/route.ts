import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { getOrgResultSettings, getOrgSellingState, getPurchasableOffers, saveOrgResultSettings } from '@/lib/org-offers-db'
import { isVisibilityTier, tierRank } from '@/lib/result-visibility'

// How much of a report a player sees for free, and what a purchase unlocks.
export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const [settings, selling, offers] = await Promise.all([
      getOrgResultSettings(session.orgId),
      getOrgSellingState(session.orgId),
      getPurchasableOffers(session.orgId),
    ])
    return NextResponse.json({
      settings,
      selling: { enabled: selling.enabled, requested: !!selling.offersRequestedAt, platformSharePercent: selling.platformSharePercent },
      unlockOfferActive: offers.some((o) => o.includesBreakdown),
    })
  } catch (err) {
    console.error('[org/result-settings] GET failed:', err)
    return NextResponse.json({ error: 'Could not load settings' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    if (!(await orgIsEntitledById(session.orgId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }
    const body = (await req.json().catch(() => ({}))) as { freeTier?: unknown; unlockTier?: unknown }
    if (!isVisibilityTier(body.freeTier) || !isVisibilityTier(body.unlockTier)) {
      return NextResponse.json({ error: 'Choose a level for both settings' }, { status: 400 })
    }
    if (tierRank(body.freeTier) > tierRank(body.unlockTier)) {
      return NextResponse.json({ error: 'The unlocked level has to show at least as much as the free level' }, { status: 400 })
    }
    await saveOrgResultSettings(session.orgId, { freeTier: body.freeTier, unlockTier: body.unlockTier })
    return NextResponse.json({ success: true, settings: { freeTier: body.freeTier, unlockTier: body.unlockTier } })
  } catch (err) {
    console.error('[org/result-settings] PUT failed:', err)
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  }
}
