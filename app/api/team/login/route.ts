import { NextRequest, NextResponse } from 'next/server'
import { signTeamSession, signTeamChoice, teamSessionCookieOptions, findCoachTeamsForLogin } from '@/lib/team-auth'
import { rateLimitLogin } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    // Tight per-account limit, looser per-IP ceiling (a gym shares one IP).
    const limit = await rateLimitLogin(req, 'team-login', typeof email === 'string' ? email : null)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const emailLower = String(email).toLowerCase().trim()

    // Every team this email coaches whose OWN row's password matches — head
    // coach rows and added-coach rows alike (see findCoachTeamsForLogin).
    const teams = await findCoachTeamsForLogin(emailLower, String(password))
    if (teams.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (teams.length > 1) {
      // See app/api/auth/login/route.ts — the choice is proven, not trusted.
      return NextResponse.json({
        multipleTeams: true,
        teams: teams.map(t => ({ id: t.teamId, name: t.name })),
        choiceToken: await signTeamChoice(emailLower, teams),
      })
    }

    const team = teams[0]
    // Bound to the matched row's password hash (see signTeamSession).
    const token = await signTeamSession({ teamId: team.teamId, adminEmail: team.email }, team.passwordHash)
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Team login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
