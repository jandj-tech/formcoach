import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgTeam, teamResultsRoster } from '@/lib/org-results'
import { getOrgSellingState, getPurchasableOffers } from '@/lib/org-offers-db'

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

    const [players, selling, offers] = await Promise.all([
      teamResultsRoster(teamId),
      getOrgSellingState(session.orgId),
      getPurchasableOffers(session.orgId),
    ])

    return NextResponse.json({
      team: { id: team.id, name: team.name, accessCode: team.accessCode },
      players,
      // Kept for older clients: team uploads always show the full report.
      settings: { freeTier: 'full', unlockTier: 'full' },
      selling: { enabled: selling.enabled, entitled: selling.entitled, disabled: selling.disabled },
      paywallWithoutOffer: false,
      offerCount: offers.length,
    })
  } catch (err) {
    console.error('[org/results-roster] failed:', err)
    return NextResponse.json({ error: 'Could not load the roster' }, { status: 500 })
  }
}
