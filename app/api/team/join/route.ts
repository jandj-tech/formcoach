import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const { teamCode, firstName, lastInitial } = await req.json()
    if (!teamCode || typeof teamCode !== 'string') {
      return NextResponse.json({ error: 'Team code required' }, { status: 400 })
    }
    if (!firstName || !lastInitial) {
      return NextResponse.json({ error: 'First name and last initial required' }, { status: 400 })
    }

    const [team] = await db`
      SELECT id, name FROM teams WHERE access_code = ${teamCode.trim().toUpperCase()}
    ` as unknown as [{ id: string; name: string } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const firstNameClean = String(firstName).trim()
    const lastInitialClean = String(lastInitial).trim().charAt(0).toUpperCase()

    await db`
      INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
      VALUES (${session.userId}, ${team.id}, ${firstNameClean}, ${lastInitialClean})
      ON CONFLICT (user_id, team_id) DO UPDATE
        SET first_name = ${firstNameClean}, last_name_initial = ${lastInitialClean}
    `

    return NextResponse.json({ success: true, teamName: team.name })
  } catch (err) {
    console.error('Team join error:', err)
    return NextResponse.json({ error: 'Failed to join team' }, { status: 500 })
  }
}
