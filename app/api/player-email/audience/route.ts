import { NextRequest, NextResponse } from 'next/server'
import { orgIsEntitledById } from '@/lib/team-features'
import { audienceMeta, loadAudience, parseAs, resolveSender, senderFromHeader } from '@/lib/player-email'

// Everyone the signed-in org (as=org) or coach (as=coach) may email, grouped
// by team, plus what the composer needs to describe the email truthfully:
// the From/Reply-To it will carry and the org's offers.
export async function GET(req: NextRequest) {
  const as = parseAs(req.nextUrl.searchParams.get('as'))
  if (!as) return NextResponse.json({ error: "as must be 'org' or 'coach'" }, { status: 400 })

  try {
    const sender = await resolveSender(req, as)
    if (!sender) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const [teams, meta, entitled] = await Promise.all([
      loadAudience(sender),
      audienceMeta(sender),
      sender.kind === 'org' ? orgIsEntitledById(sender.orgId) : Promise.resolve(true),
    ])

    return NextResponse.json({
      sender: {
        kind: sender.kind,
        displayName: sender.displayName,
        replyTo: sender.replyTo,
        fromHeader: senderFromHeader(sender),
        // Additive details for the UI.
        name: sender.kind === 'org' ? sender.orgName : sender.coachName,
        orgName: sender.orgName,
        teamName: sender.kind === 'coach' ? sender.teamName : null,
        actingAsOrg: sender.kind === 'coach' ? sender.actingAsOrg : false,
        entitled,
      },
      teams,
      offers: meta.offers,
      results: meta.results,
    })
  } catch (err) {
    console.error('[player-email/audience] failed:', err)
    return NextResponse.json({ error: 'Could not load your players' }, { status: 500 })
  }
}
