import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { teamIsEntitled, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { db } from '@/lib/db'
import { addPlayerToTeam, AddPlayerError } from '@/lib/roster-players'

// Coach adds a player to their team. No password required. With an email the
// player becomes a real (password-less) account + membership and gets a setup
// link; without one they stay a name-only pending invite (claimed by link).
// Back-compat: older clients send { firstName, lastInitial } and no email.
export async function POST(req: NextRequest) {
  try {
    const session = await getTeamSessionFromRequest(req)
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

    if (!(await teamIsEntitled(session.teamId))) {
      return NextResponse.json(
        { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
        { status: 402 },
      )
    }

    const body = (await req.json().catch(() => ({}))) as {
      firstName?: string
      lastName?: string
      lastInitial?: string
      email?: string
      parentName?: string
      phone?: string
      sendEmail?: boolean
    }

    const [team] = (await db`SELECT name FROM teams WHERE id = ${session.teamId}`) as unknown as [{ name: string } | undefined]

    const result = await addPlayerToTeam({
      teamId: session.teamId,
      firstName: body.firstName ?? '',
      lastName: body.lastName ?? body.lastInitial ?? null,
      email: body.email ?? null,
      parentName: body.parentName ?? null,
      phone: body.phone ?? null,
      sendEmail: body.sendEmail ?? true,
      teamName: team?.name ?? null,
    })

    // Back-compat shape: the current dashboard reads `player` + `inviteUrl`.
    return NextResponse.json({
      ...result,
      player: { first_name: body.firstName ?? '', last_name_initial: (body.lastName ?? body.lastInitial ?? '').trim().charAt(0) || null },
      inviteUrl: result.inviteUrl ?? result.setupUrl ?? null,
    })
  } catch (err) {
    if (err instanceof AddPlayerError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('add-player error:', err)
    return NextResponse.json({ error: 'Failed to add player' }, { status: 500 })
  }
}
