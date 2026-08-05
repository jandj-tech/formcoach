import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveChatActorFromRequest, canPostInChat, NO_ACCESS_MESSAGE } from '@/lib/team-chat'
import { isCleanDisplayText } from '@/lib/moderation'

// GET /api/team/chat?teamId=...&after=<messageId> — messages plus the
// caller's permissions. Messages from users the caller blocked are hidden.
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') ?? ''
  const after = parseInt(req.nextUrl.searchParams.get('after') ?? '0', 10) || 0
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  const identity = actor.identity

  try {
    type MessageRow = {
      id: number; sender_user_id: string | null; sender_name: string
      sender_role: string; body: string; created_at: string
    }
    // Personal blocks only exist for player accounts — coach/org sessions
    // have no users row, so they read the unfiltered feed.
    const messages = (actor.userId
      ? await db`
          SELECT m.id, m.sender_user_id, m.sender_name, m.sender_role, m.body, m.created_at
          FROM team_messages m
          WHERE m.team_id = ${teamId}
            AND m.deleted = FALSE
            AND m.id > ${after}
            AND (m.sender_user_id IS NULL OR m.sender_user_id NOT IN (
              SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id = ${actor.userId}
            ))
          ORDER BY m.id DESC
          LIMIT 50
        `
      : await db`
          SELECT m.id, m.sender_user_id, m.sender_name, m.sender_role, m.body, m.created_at
          FROM team_messages m
          WHERE m.team_id = ${teamId}
            AND m.deleted = FALSE
            AND m.id > ${after}
          ORDER BY m.id DESC
          LIMIT 50
        `) as unknown as MessageRow[]

    // Coach extras: roster with per-player access state for the manage panel.
    let mutedUserIds: string[] = []
    let members: Array<{ id: string; name: string; allowed: boolean }> = []
    if (identity.isCoach) {
      try {
        const rows = (await db`
          SELECT user_id FROM team_chat_mutes WHERE team_id = ${teamId}
        `) as unknown as Array<{ user_id: string }>
        mutedUserIds = rows.map(r => r.user_id)
      } catch {}
      try {
        const roster = (await db`
          SELECT u.id,
                 COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
                 COALESCE(tm.last_name_initial, '') AS last_name_initial,
                 (SELECT COUNT(*) FROM team_chat_allows a WHERE a.team_id = ${teamId} AND a.user_id = u.id)::int AS allowed
          FROM team_memberships tm
          JOIN users u ON u.id = tm.user_id
          WHERE tm.team_id = ${teamId}
          ORDER BY tm.first_name ASC NULLS LAST
        `) as unknown as Array<{ id: string; first_name: string; last_name_initial: string; allowed: number }>
        members = roster.map(r => ({
          id: r.id,
          name: r.last_name_initial ? `${r.first_name} ${r.last_name_initial.charAt(0)}.` : r.first_name,
          allowed: r.allowed > 0,
        }))
      } catch {}
    }

    const canPost = canPostInChat(identity)
    return NextResponse.json({
      messages: messages.reverse().map(m => ({
        id: Number(m.id),
        senderUserId: m.sender_user_id,
        senderName: m.sender_name,
        senderRole: m.sender_role,
        body: m.body,
        createdAt: m.created_at,
        mine: actor.userId
          ? m.sender_user_id === actor.userId
          : identity.isCoach && m.sender_user_id === null && m.sender_name === identity.senderName,
      })),
      canPost,
      postBlockedReason: canPost
        ? null
        : identity.muted
          ? 'Your coach has turned off chat for you.'
          : NO_ACCESS_MESSAGE,
      chatMode: identity.chatMode,
      isCoach: identity.isCoach,
      mutedUserIds,
      members,
      teamName: identity.teamName,
    })
  } catch (err) {
    console.error('[team/chat] list failed:', err)
    return NextResponse.json({ error: 'Could not load chat' }, { status: 500 })
  }
}

// POST /api/team/chat { teamId, body } — send a message.
export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({})) as { teamId?: string; body?: string }
  const teamId = (payload.teamId ?? '').toString()
  const body = (payload.body ?? '').toString().trim().slice(0, 1000)
  if (!teamId || !body) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  const identity = actor.identity

  if (!canPostInChat(identity)) {
    return NextResponse.json({
      error: identity.muted ? 'Your coach has turned off chat for you.' : NO_ACCESS_MESSAGE,
    }, { status: 403 })
  }

  // Kid-safety: server-side language filter on every message.
  if (!isCleanDisplayText(body)) {
    return NextResponse.json({ error: 'That message contains language we don\'t allow.' }, { status: 400 })
  }

  try {
    const [msg] = (await db`
      INSERT INTO team_messages (team_id, sender_user_id, sender_name, sender_role, body)
      VALUES (${teamId}, ${actor.userId}, ${identity.senderName}, ${identity.isCoach ? 'coach' : 'player'}, ${body})
      RETURNING id, created_at
    `) as unknown as [{ id: number; created_at: string }]

    return NextResponse.json({
      message: {
        id: Number(msg.id),
        senderUserId: actor.userId,
        senderName: identity.senderName,
        senderRole: identity.isCoach ? 'coach' : 'player',
        body,
        createdAt: msg.created_at,
        mine: true,
      },
    })
  } catch (err) {
    console.error('[team/chat] send failed:', err)
    return NextResponse.json({ error: 'Could not send message' }, { status: 500 })
  }
}
