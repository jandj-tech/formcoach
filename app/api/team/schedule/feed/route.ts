import { NextRequest, NextResponse } from 'next/server'
import { resolveChatActorFromRequest } from '@/lib/team-chat'
import { FEATURE_UPGRADE_MESSAGE, tierCan } from '@/lib/team-features'
import { feedUrls, getOrCreateFeedToken, rotateFeedToken } from '@/lib/team-calendar'

/**
 * The calendar link, for people who are logged in.
 *
 * Separate from the feed itself (feed/[token]/route.ts) because they answer to
 * different callers: this one needs a session and hands out the secret, that
 * one has no session and consumes it.
 */

// GET /api/team/schedule/feed?teamId=<uuid> → the subscribe URLs.
// Any member or coach. The token is minted on first ask, so a team that never
// opens the calendar panel never has a secret to leak.
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') ?? ''
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  if (!tierCan(actor.tier, 'schedule')) {
    return NextResponse.json({ error: FEATURE_UPGRADE_MESSAGE, upgradeRequired: true }, { status: 402 })
  }

  try {
    const token = await getOrCreateFeedToken(teamId)
    return NextResponse.json({ ...feedUrls(token), canRotate: actor.identity.isCoach })
  } catch (err) {
    console.error('[team/schedule/feed] issuing the link failed:', err)
    return NextResponse.json({ error: 'Could not create your calendar link' }, { status: 500 })
  }
}

// POST /api/team/schedule/feed { teamId } → a brand new token.
// Coach only, and deliberately destructive: every calendar anyone already
// subscribed with stops updating. That is the whole point — it is the undo for
// a link that reached someone it shouldn't have.
export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as { teamId?: string }
  const teamId = (payload.teamId ?? '').toString()
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  if (!tierCan(actor.tier, 'schedule')) {
    return NextResponse.json({ error: FEATURE_UPGRADE_MESSAGE, upgradeRequired: true }, { status: 402 })
  }
  if (!actor.identity.isCoach) {
    return NextResponse.json({ error: 'Only a coach can reset the calendar link' }, { status: 403 })
  }

  try {
    const token = await rotateFeedToken(teamId)
    return NextResponse.json({ ...feedUrls(token), canRotate: true })
  } catch (err) {
    console.error('[team/schedule/feed] rotate failed:', err)
    return NextResponse.json({ error: 'Could not reset the link' }, { status: 500 })
  }
}
