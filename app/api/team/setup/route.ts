import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Setup token is required' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password (6+ characters) required' }, { status: 400 })
    }

    const [team] = await db`
      SELECT id, admin_email FROM teams WHERE coach_invite_token = ${token}
    ` as unknown as [{ id: string; admin_email: string } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Invalid or expired setup link' }, { status: 404 })
    }

    const hash = await bcrypt.hash(password, 10)

    await db`
      UPDATE teams
      SET password_hash = ${hash}, coach_invite_token = NULL, invite_sent_at = NULL
      WHERE id = ${team.id}
    `

    const sessionToken = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('Team setup error:', err)
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 })
  }
}
