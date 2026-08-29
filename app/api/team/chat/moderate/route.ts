import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveChatActorFromRequest } from '@/lib/team-chat'
import { NO_PLAN_MESSAGE, tierCan } from '@/lib/team-features'

// Coach moderation + everyone's self-service actions:
//   { teamId, action: 'mode', mode: 'everyone' | 'coach-only' }   (coach)
//   { teamId, action: 'allow' | 'disallow', userId }               (coach)
//   { teamId, action: 'mute' | 'unmute', userId }                 (coach)
//   { teamId, action: 'delete', messageId }                       (coach or own message)
export async function POST(req: NextRequest) {
  const p = await req.json().catch(() => ({})) as {
    teamId?: string; action?: string; mode?: string; userId?: string; messageId?: number
  }
  const teamId = (p.teamId ?? '').toString()
  if (!teamId || !p.action) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  if (!tierCan(actor.tier, 'chat')) {
    return NextResponse.json({ error: NO_PLAN_MESSAGE, upgradeRequired: true }, { status: 402 })
  }
  const identity = actor.identity

  try {
    if (p.action === 'mode') {
      if (!identity.isCoach) return NextResponse.json({ error: 'Coach only' }, { status: 403 })
      const mode = p.mode === 'coach-only' ? 'coach-only' : 'everyone'
      await db`UPDATE teams SET chat_mode = ${mode} WHERE id = ${teamId}`
      return NextResponse.json({ success: true, chatMode: mode })
    }

    if (p.action === 'allow' || p.action === 'disallow') {
      if (!identity.isCoach) return NextResponse.json({ error: 'Coach only' }, { status: 403 })
      if (!p.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
      if (p.action === 'allow') {
        await db`
          INSERT INTO team_chat_allows (team_id, user_id) VALUES (${teamId}, ${p.userId})
          ON CONFLICT DO NOTHING
        `
      } else {
        await db`DELETE FROM team_chat_allows WHERE team_id = ${teamId} AND user_id = ${p.userId}`
      }
      return NextResponse.json({ success: true })
    }

    if (p.action === 'mute' || p.action === 'unmute') {
      if (!identity.isCoach) return NextResponse.json({ error: 'Coach only' }, { status: 403 })
      if (!p.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
      if (p.action === 'mute') {
        await db`
          INSERT INTO team_chat_mutes (team_id, user_id) VALUES (${teamId}, ${p.userId})
          ON CONFLICT DO NOTHING
        `
      } else {
        await db`DELETE FROM team_chat_mutes WHERE team_id = ${teamId} AND user_id = ${p.userId}`
      }
      return NextResponse.json({ success: true })
    }

    if (p.action === 'delete') {
      if (!p.messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 })
      // Coaches can remove any message on their team; players only their own.
      const result = identity.isCoach
        ? await db`UPDATE team_messages SET deleted = TRUE WHERE id = ${p.messageId} AND team_id = ${teamId}`
        : await db`UPDATE team_messages SET deleted = TRUE WHERE id = ${p.messageId} AND team_id = ${teamId} AND sender_user_id = ${actor.userId}`
      void result
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[team/chat/moderate] failed:', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
