import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgTeam, teamResultsRoster } from '@/lib/org-results'
import { getOrgResultSettings, getOrgSellingState, getPurchasableOffers } from '@/lib/org-offers-db'
import { tierRank } from '@/lib/result-visibility'

// The Results tab's roster: every player on one of the org's teams, their
// latest graded shot, and whether/when their result was sent.
export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const teamId = req.nextUrl.searchParams.get('teamId') ?? ''
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  try {
    const team = await orgTeam(session.orgId, teamId)
    if (!team) return NextResponse.json({ error: 'Not your team' }, { status: 403 })

    const [players, settings, selling, offers] = await Promise.all([
      teamResultsRoster(teamId),
      getOrgResultSettings(session.orgId),
      getOrgSellingState(session.orgId),
      getPurchasableOffers(session.orgId),
    ])

    const paywalled = tierRank(settings.freeTier) < tierRank(settings.unlockTier)
    const unlockOfferActive = offers.some((o) => o.includesBreakdown)

    return NextResponse.json({
      team: { id: team.id, name: team.name, accessCode: team.accessCode },
      players,
      settings,
      selling: { enabled: selling.enabled, requested: !!selling.offersRequestedAt },
      // A paywall with nothing to buy is worth a warning before the coach
      // sends: players would see the free tier and no way to unlock.
      paywallWithoutOffer: paywalled && !(selling.enabled && unlockOfferActive),
      offerCount: offers.length,
    })
  } catch (err) {
    console.error('[org/results-roster] failed:', err)
    return NextResponse.json({ error: 'Could not load the roster' }, { status: 500 })
  }
}
