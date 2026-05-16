import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()
    const teams = await db`
      SELECT id, admin_email, password_hash, name FROM teams
      WHERE admin_email = ${emailLower} AND password_hash IS NOT NULL
    ` as unknown as Array<{ id: string; admin_email: string; password_hash: string; name: string }>

    if (teams.length === 0) {
      // Not a founding coach — check additional coaches (team_coaches).
      try {
        const [coach] = (await db`
          SELECT team_id, email, password_hash
          FROM team_coaches
          WHERE email = ${emailLower} AND password_hash IS NOT NULL
        `) as unknown as [{ team_id: string; email: string; password_hash: string } | undefined]

        if (coach && (await bcrypt.compare(password, coach.password_hash))) {
          const coachToken = await signTeamSession({ teamId: coach.team_id, adminEmail: coach.email })
          const coachRes = NextResponse.json({ success: true })
          coachRes.cookies.set(teamSessionCookieOptions(coachToken))
          return coachRes
        }
      } catch (err) {
        console.warn('team_coaches lookup failed (table may not exist yet):', err instanceof Error ? err.message : err)
      }

      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // All teams for the same coach share the same password, so compare once.
    const valid = await bcrypt.compare(password, teams[0].password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (teams.length > 1) {
      return NextResponse.json({
        multipleTeams: true,
        teams: teams.map(t => ({ id: t.id, name: t.name })),
      })
    }

    const team = teams[0]
    const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Team login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
