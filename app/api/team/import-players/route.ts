import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { teamIsEntitled, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { addPlayerToTeam, AddPlayerError, type AddPlayerStatus } from '@/lib/roster-players'
import type { ImportRowInput } from '@/app/api/org/import-players/route'

const MAX_ROWS = 200

interface RowResult {
  index: number
  name: string
  status: AddPlayerStatus | 'error'
  detail?: string
}

// Coach bulk-adds a CSV's players to their own team. Same per-row path as a
// single add, so dedupe-by-email and setup emails behave identically.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  if (!(await teamIsEntitled(session.teamId))) {
    return NextResponse.json(
      { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
      { status: 402 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { rows?: ImportRowInput[]; sendEmail?: boolean }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'No players to import' }, { status: 400 })
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Please import at most ${MAX_ROWS} players at a time.` }, { status: 400 })
  }

  const [team] = (await db`SELECT name FROM teams WHERE id = ${session.teamId}`) as unknown as [{ name: string } | undefined]

  const sendEmail = body.sendEmail ?? true
  const results: RowResult[] = []
  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i]
    const label = `${(row.firstName ?? '').trim()} ${(row.lastName ?? '').trim()}`.trim() || (row.email ?? '').trim()
    try {
      const r = await addPlayerToTeam({
        teamId: session.teamId,
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? null,
        email: row.email ?? null,
        parentName: row.parentName ?? null,
        phone: row.phone ?? null,
        sendEmail,
        teamName: team?.name ?? null,
      })
      results.push({ index: i, name: r.displayName || label, status: r.status })
    } catch (err) {
      results.push({
        index: i,
        name: label,
        status: 'error',
        detail: err instanceof AddPlayerError ? err.message : 'Could not add this player',
      })
      if (!(err instanceof AddPlayerError)) console.error('team import-players row error:', err)
    }
  }

  const added = results.filter(r => r.status === 'created' || r.status === 'linked' || r.status === 'invited').length
  const skipped = results.filter(r => r.status === 'already_on_team').length
  const failed = results.filter(r => r.status === 'error').length
  return NextResponse.json({ results, summary: { added, skipped, failed, total: results.length } })
}
