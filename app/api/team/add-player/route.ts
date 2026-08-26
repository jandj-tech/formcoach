import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'
import { randomBytes } from 'crypto'
import { isCleanDisplayText, BLOCKED_TEXT_ERROR } from '@/lib/moderation'
import { resolveBaseUrl } from '@/lib/base-url'

const BASE_URL = resolveBaseUrl()

export async function POST(req: NextRequest) {
  try {
    const session = await getTeamSessionFromRequest(req)
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

    const { firstName, lastInitial } = await req.json()
    if (!isCleanDisplayText(`${firstName ?? ''} ${lastInitial ?? ''}`)) {
      return NextResponse.json({ error: BLOCKED_TEXT_ERROR }, { status: 400 })
    }
    if (!firstName || !firstName.trim()) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 })
    }

    const inviteToken = randomBytes(24).toString('hex')

    const [player] = await db`
      INSERT INTO pending_team_members (team_id, first_name, last_name_initial, invite_token)
      VALUES (${session.teamId}, ${firstName.trim()}, ${lastInitial?.trim().charAt(0) || null}, ${inviteToken})
      RETURNING id, first_name, last_name_initial, invite_token
    ` as unknown as [{ id: string; first_name: string; last_name_initial: string | null; invite_token: string }]

    const inviteUrl = `${BASE_URL}/signup?teamInvite=${inviteToken}`

    return NextResponse.json({ player, inviteUrl })
  } catch (err) {
    console.error('add-player error:', err)
    return NextResponse.json({ error: 'Failed to add player' }, { status: 500 })
  }
}
