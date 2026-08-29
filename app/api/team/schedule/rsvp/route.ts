import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveChatActorFromRequest } from '@/lib/team-chat'
import { FEATURE_UPGRADE_MESSAGE, tierCan } from '@/lib/team-features'
import { isCleanDisplayText } from '@/lib/moderation'
import {
  getEventById,
  getRoster,
  getRsvpsForEvents,
  isEventLocked,
  serializeEvent,
} from '@/lib/team-schedule'

// POST /api/team/schedule/rsvp { teamId, eventId, status: 'in'|'out'|'clear', note? }
// The hot path: one-tap RSVP for player accounts. 'clear' returns the player
// to no-reply. Responds with the fresh serialized event so the client swaps
// the card in place — no list refetch.
export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as {
    teamId?: string
    eventId?: string
    status?: string
    note?: string
  }
  const teamId = (payload.teamId ?? '').toString()
  const eventId = (payload.eventId ?? '').toString()
  const status = (payload.status ?? '').toString()
  if (!teamId || !eventId) return NextResponse.json({ error: 'teamId and eventId required' }, { status: 400 })
  if (status !== 'in' && status !== 'out' && status !== 'clear') {
    return NextResponse.json({ error: 'status must be in, out, or clear' }, { status: 400 })
  }

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  if (!tierCan(actor.tier, 'schedule')) {
    return NextResponse.json({ error: FEATURE_UPGRADE_MESSAGE, upgradeRequired: true }, { status: 402 })
  }
  if (actor.userId === null) {
    return NextResponse.json({ error: "Coach and organization accounts don't RSVP" }, { status: 403 })
  }
  if (!actor.identity.isMember) {
    return NextResponse.json({ error: 'Not on this team' }, { status: 403 })
  }

  const event = await getEventById(eventId)
  if (!event || event.team_id !== teamId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }
  if (isEventLocked(event)) {
    return NextResponse.json({ error: 'RSVPs are locked — this event has started.' }, { status: 409 })
  }
  if (event.status === 'cancelled') {
    return NextResponse.json({ error: 'This event was cancelled.' }, { status: 409 })
  }

  let note: string | null = null
  if (payload.note !== undefined && payload.note !== null) {
    note = String(payload.note).trim().slice(0, 140)
    if (!note) note = null
    else if (!isCleanDisplayText(note)) {
      return NextResponse.json({ error: "That text contains language we don't allow." }, { status: 400 })
    }
  }

  try {
    if (status === 'clear') {
      await db`
        DELETE FROM team_event_rsvps WHERE event_id = ${eventId} AND user_id = ${actor.userId}
      `
    } else if (note !== null) {
      // Branched note-present vs note-absent queries — never pass a possibly
      // NULL param where the planner can't type it (known prod-500 trap).
      await db`
        INSERT INTO team_event_rsvps (event_id, user_id, status, note)
        VALUES (${eventId}, ${actor.userId}, ${status}, ${note})
        ON CONFLICT (event_id, user_id)
        DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = NOW()
      `
    } else {
      // No note supplied → the reply stands alone (a stale "running late"
      // must not survive a status flip).
      await db`
        INSERT INTO team_event_rsvps (event_id, user_id, status)
        VALUES (${eventId}, ${actor.userId}, ${status})
        ON CONFLICT (event_id, user_id)
        DO UPDATE SET status = EXCLUDED.status, note = NULL, updated_at = NOW()
      `
    }

    const [rsvps, roster] = await Promise.all([getRsvpsForEvents([eventId]), getRoster(teamId)])
    return NextResponse.json({ event: serializeEvent(event, rsvps, roster, actor.userId) })
  } catch (err) {
    console.error('[team/schedule] rsvp failed:', err)
    return NextResponse.json({ error: 'Could not save your RSVP' }, { status: 500 })
  }
}
