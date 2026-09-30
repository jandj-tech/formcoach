import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { changeHeadCoach, HeadCoachError, loadHeadCoachPreview } from '@/lib/change-head-coach'

// The org dashboard's "Change head coach" panel.
//   GET  ?teamId=…  → who holds the seat now, their tokens, and who can take it
//   POST {teamId, newHeadCoachId: <team_coaches id> | 'org', returnTokens}
// Org session only; the team must belong to the org, and the new head coach
// must be an assistant on THIS team who has finished setup.

function fail(err: unknown, what: string) {
  if (err instanceof HeadCoachError) return NextResponse.json({ error: err.message }, { status: err.status })
  console.error(`change-head-coach ${what} error:`, err)
  return NextResponse.json({ error: 'Could not change the head coach. Please try again.' }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  try {
    return NextResponse.json(await loadHeadCoachPreview(session.orgId, teamId))
  } catch (err) {
    return fail(err, 'preview')
  }
}

export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    teamId?: unknown
    newHeadCoachId?: unknown
    returnTokens?: unknown
  }
  if (typeof body.teamId !== 'string' || !body.teamId) {
    return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  }
  if (typeof body.newHeadCoachId !== 'string' || !body.newHeadCoachId) {
    return NextResponse.json({ error: 'Pick who should be head coach' }, { status: 400 })
  }
  const target = body.newHeadCoachId === 'org' ? 'org' as const : { coachId: body.newHeadCoachId }

  try {
    const result = await changeHeadCoach(session.orgId, body.teamId, target, body.returnTokens === true)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return fail(err, 'change')
  }
}
