import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { addPlayerToTeam, AddPlayerError, type AddPlayerStatus } from '@/lib/roster-players'

const MAX_ROWS = 200

export interface ImportRowInput {
  firstName?: string
  lastName?: string
  email?: string
  parentName?: string
  phone?: string
}

interface RowResult {
  index: number
  name: string
  status: AddPlayerStatus | 'error'
  detail?: string
}

// Bulk-adds a CSV's players to one team the org owns. Rows are validated and
// parsed on the client; here each row runs through the same add-player path as
// a single add, so dedupe-by-email and setup emails behave identically.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await orgIsEntitledById(session.orgId))) {
    return NextResponse.json(
      { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
      { status: 402 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    teamId?: string
    rows?: ImportRowInput[]
    sendEmail?: boolean
  }
  if (!body.teamId) return NextResponse.json({ error: 'Team is required' }, { status: 400 })
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'No players to import' }, { status: 400 })
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Please import at most ${MAX_ROWS} players at a time.` }, { status: 400 })
  }

  const [team] = (await db`
    SELECT id, name FROM teams WHERE id = ${body.teamId} AND organization_id = ${session.orgId}
  `) as unknown as [{ id: string; name: string } | undefined]
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  const sendEmail = body.sendEmail ?? true
  const results: RowResult[] = []

  // Sequential on purpose: one email per new stub, and the volumes here are a
  // roster (tens), not a mailing list. Keeps ordering stable for the summary.
  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i]
    const label = `${(row.firstName ?? '').trim()} ${(row.lastName ?? '').trim()}`.trim() || (row.email ?? '').trim()
    try {
      const r = await addPlayerToTeam({
        teamId: team.id,
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? null,
        email: row.email ?? null,
        parentName: row.parentName ?? null,
        phone: row.phone ?? null,
        sendEmail,
        teamName: team.name,
      })
      results.push({ index: i, name: r.displayName || label, status: r.status })
    } catch (err) {
      results.push({
        index: i,
        name: label,
        status: 'error',
        detail: err instanceof AddPlayerError ? err.message : 'Could not add this player',
      })
      if (!(err instanceof AddPlayerError)) console.error('import-players row error:', err)
    }
  }

  const added = results.filter(r => r.status === 'created' || r.status === 'linked' || r.status === 'invited').length
  const skipped = results.filter(r => r.status === 'already_on_team').length
  const failed = results.filter(r => r.status === 'error').length

  return NextResponse.json({ results, summary: { added, skipped, failed, total: results.length } })
}
