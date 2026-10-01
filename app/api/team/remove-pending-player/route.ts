import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { removeNameOnlyEntry } from '@/lib/roster-players'

// Lets a team admin cancel a pending player they added by name, before that
// player has created an account and joined the team. Their shots on this
// team go with them (lib/roster-players removeNameOnlyEntry).
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { playerId?: string }
  if (!body.playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const out = await removeNameOnlyEntry(session.teamId, body.playerId)
  if (!out.removed) {
    return NextResponse.json(
      { error: 'That player isn’t waiting to join any more — they may have joined already. Refresh the page to see the current roster.' },
      { status: 404 },
    )
  }
  return NextResponse.json({ removed: true, removedShots: out.removedShots })
}
