import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'

export async function POST(req: NextRequest) {
  try {
    const { teamId, email } = await req.json()
    if (!teamId || !email) {
      return NextResponse.json({ error: 'Team and email required' }, { status: 400 })
    }

    const emailLower = String(email).toLowerCase().trim()
    const [team] = await db`
      SELECT id, admin_email FROM teams WHERE id = ${teamId} AND admin_email = ${emailLower}
    ` as unknown as [{ id: string; admin_email: string } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })
    }

    const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Team select error:', err)
    return NextResponse.json({ error: 'Failed to select team' }, { status: 500 })
  }
}
