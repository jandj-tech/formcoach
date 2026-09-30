import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { teamIsEntitled, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { addPlayerToTeam, AddPlayerError, getTeamContext, coachDisplayName } from '@/lib/roster-players'

// Coach adds a player to their team. No password required. With an email the
// player becomes a real (password-less) account + membership and the setup
// link is emailed to that address (never returned here); without one they
// stay a name-only pending invite whose join link IS returned to share.
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
      allowDuplicateName?: boolean
    }

    const team = await getTeamContext(session.teamId)
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    const result = await addPlayerToTeam({
      teamId: team.id,
      firstName: body.firstName ?? '',
      lastName: body.lastName ?? body.lastInitial ?? null,
      email: body.email ?? null,
      parentName: body.parentName ?? null,
      phone: body.phone ?? null,
      sendEmail: body.sendEmail ?? true,
      teamName: team.name,
      orgName: team.orgName,
      addedBy: (await coachDisplayName(team.id, session.adminEmail)) ?? team.orgName,
      allowDuplicateName: !!body.allowDuplicateName,
    })

    // Back-compat shape: the coach dashboard reads `player` + `inviteUrl`.
    // inviteUrl is only ever a name-only join link — never a setup link.
    return NextResponse.json({
      ...result,
      player: { first_name: body.firstName ?? '', last_name_initial: (body.lastName ?? body.lastInitial ?? '').trim().charAt(0) || null },
      inviteUrl: result.inviteUrl ?? null,
    })
  } catch (err) {
    if (err instanceof AddPlayerError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('add-player error:', err)
    return NextResponse.json({ error: 'Could not add the player. Please try again.' }, { status: 500 })
  }
}
