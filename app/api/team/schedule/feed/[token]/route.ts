import { NextRequest, NextResponse } from 'next/server'
import { buildTeamCalendar } from '@/lib/ics'
import { feedEvents, teamForFeedToken } from '@/lib/team-calendar'
import { resolveBaseUrl } from '@/lib/base-url'
import { teamCan } from '@/lib/team-features'

// The feed changes whenever a coach edits the schedule, and calendar clients
// cache aggressively on their own. Never let a CDN add a second layer of stale.
export const dynamic = 'force-dynamic'

/**
 * GET /api/team/schedule/feed/<token>[.ics]
 *
 * The subscribable calendar. Fetched by Google's and Apple's servers, which
 * carry no cookies — so there is no session here by design and the token in the
 * path is the credential. See lib/team-calendar.ts for what that does and
 * doesn't expose.
 *
 * `?download=1` serves the same body as a one-off file for people who want a
 * snapshot in their calendar rather than a live subscription.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params
  // People paste links with the extension and some clients probe for one.
  // Same feed either way.
  const token = decodeURIComponent(raw).replace(/\.ics$/i, '')

  const team = await teamForFeedToken(token)
  // A wrong token is 404, not 403: confirming that a token is "valid but not
  // yours" would make guessing measurably easier, and there is nothing here a
  // 403 would usefully tell an honest caller.
  if (!team) return new NextResponse('Not found', { status: 404 })

  // Scheduling is part of the Plus plan, and a feed is a schedule that keeps
  // working after someone stops looking at the site — so it has to answer to
  // the same predicate rather than outliving the plan that paid for it.
  if (!(await teamCan(team.id, 'schedule'))) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const events = await feedEvents(team.id)
    const body = buildTeamCalendar({
      name: `${team.name} Schedule`,
      description: `Practices and games for ${team.name}, from LearnHoops.`,
      url: `${resolveBaseUrl()}/team`,
      uidDomain: 'learnhoops.com',
      events,
    })

    const download = req.nextUrl.searchParams.get('download') === '1'
    // A fixed filename: the team name is user text and has no business in a
    // response header.
    const filename = download ? 'learnhoops-schedule.ics' : null

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        ...(filename ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}),
      },
    })
  } catch (err) {
    console.error('[team/schedule/feed] build failed:', err)
    return new NextResponse('Could not build the calendar', { status: 500 })
  }
}
