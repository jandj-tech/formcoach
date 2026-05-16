import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'

// Rename the team the coach is currently in.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { name } = await req.json()
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }
    if (trimmed.length > 255) {
      return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
    }

    await db`UPDATE teams SET name = ${trimmed} WHERE id = ${session.teamId}`
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Team rename error:', err)
    return NextResponse.json({ error: 'Could not rename' }, { status: 500 })
  }
}
