import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveChatActorFromRequest } from '@/lib/team-chat'
import { isCleanDisplayText } from '@/lib/moderation'
import {
  EVENT_TYPES,
  type EventType,
  type TeamEventRow,
  addWeeksPreservingWallClock,
  getEventById,
  getRoster,
  getRsvpsForEvents,
  serializeEvent,
} from '@/lib/team-schedule'

const BAD_TEXT_ERROR = "That text contains language we don't allow."

// Kid-safety: every free-text field is trimmed, length-checked and passed
// through the same server-side language filter as chat. Empty → null.
function cleanText(
  value: unknown,
  maxLen: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null }
  const text = String(value).trim()
  if (!text) return { ok: true, value: null }
  if (text.length > maxLen) return { ok: false, error: `Text too long (max ${maxLen} characters)` }
  if (!isCleanDisplayText(text)) return { ok: false, error: BAD_TEXT_ERROR }
  return { ok: true, value: text }
}

// "Not older than today": a start on any earlier day is rejected, but a time
// earlier today is fine (coach logging tonight's practice this morning). The
// server never interprets timezones — a flat 24h grace covers every locale.
function isPastDay(startsAt: Date): boolean {
  return startsAt.getTime() < Date.now() - 24 * 60 * 60 * 1000
}

// GET /api/team/schedule?teamId=<uuid>&window=upcoming|past
// Any team member or coach. One payload: events + counts + names + myRsvp.
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') ?? ''
  const window = req.nextUrl.searchParams.get('window') === 'past' ? 'past' : 'upcoming'
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  try {
    // A just-started/just-finished event lingers 3h in "upcoming" so the
    // final list is checkable courtside.
    const events = (window === 'upcoming'
      ? await db`
          SELECT * FROM team_events
          WHERE team_id = ${teamId} AND starts_at > NOW() - INTERVAL '3 hours'
          ORDER BY starts_at ASC
          LIMIT 50
        `
      : await db`
          SELECT * FROM team_events
          WHERE team_id = ${teamId} AND starts_at <= NOW() - INTERVAL '3 hours'
          ORDER BY starts_at DESC
          LIMIT 25
        `) as unknown as TeamEventRow[]

    // All RSVPs for the page in ONE query + roster once — no N+1.
    const [rsvps, roster] = await Promise.all([
      getRsvpsForEvents(events.map(e => e.id)),
      getRoster(teamId),
    ])

    return NextResponse.json({
      teamName: actor.identity.teamName,
      isCoach: actor.identity.isCoach,
      canRsvp: actor.userId !== null && actor.identity.isMember,
      memberCount: roster.length,
      events: events.map(e => serializeEvent(e, rsvps, roster, actor.userId)),
    })
  } catch (err) {
    console.error('[team/schedule] list failed:', err)
    return NextResponse.json({ error: 'Could not load schedule' }, { status: 500 })
  }
}

// POST /api/team/schedule — create (coach only). "Repeat weekly ×N"
// materializes N independent rows — every occurrence individually editable.
export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as {
    teamId?: string
    type?: string
    startsAt?: string
    timeTbd?: boolean
    title?: string
    location?: string
    notes?: string
    repeatWeeks?: number
    timeZone?: string
  }
  const teamId = (payload.teamId ?? '').toString()
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  if (!actor.identity.isCoach) return NextResponse.json({ error: 'Coach only' }, { status: 403 })

  const type = (payload.type ?? '').toString()
  if (!(EVENT_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
  }

  const startsAt = new Date(payload.startsAt ?? '')
  if (isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid start time' }, { status: 400 })
  }
  if (isPastDay(startsAt)) {
    return NextResponse.json({ error: 'Events can’t start in the past' }, { status: 400 })
  }

  const repeatWeeks = payload.repeatWeeks === undefined ? 1 : Number(payload.repeatWeeks)
  if (!Number.isInteger(repeatWeeks) || repeatWeeks < 1 || repeatWeeks > 16) {
    return NextResponse.json({ error: 'repeatWeeks must be 1–16' }, { status: 400 })
  }

  // Creator's IANA timezone — lets weekly repeats keep the same local
  // wall-clock time across DST switches. Optional; invalid values are
  // ignored inside addWeeksPreservingWallClock.
  const timeZone =
    typeof payload.timeZone === 'string' && payload.timeZone.length <= 64 ? payload.timeZone : null

  const timeTbd = payload.timeTbd === true
  const title = cleanText(payload.title, 120)
  if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 })
  const location = cleanText(payload.location, 200)
  if (!location.ok) return NextResponse.json({ error: location.error }, { status: 400 })
  const notes = cleanText(payload.notes, 500)
  if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 })

  try {
    const created: TeamEventRow[] = []
    for (let week = 0; week < repeatWeeks; week++) {
      const occurrence = addWeeksPreservingWallClock(startsAt, week, timeZone)
      const [row] = (await db`
        INSERT INTO team_events (team_id, type, title, location, notes, starts_at, time_tbd, created_by_email)
        VALUES (${teamId}, ${type as EventType}, ${title.value}, ${location.value}, ${notes.value},
                ${occurrence.toISOString()}, ${timeTbd}, ${actor.email})
        RETURNING *
      `) as unknown as [TeamEventRow]
      created.push(row)
    }

    const roster = await getRoster(teamId)
    return NextResponse.json({
      events: created.map(e => serializeEvent(e, [], roster, actor.userId)),
    })
  } catch (err) {
    console.error('[team/schedule] create failed:', err)
    return NextResponse.json({ error: 'Could not create event' }, { status: 500 })
  }
}

// PATCH /api/team/schedule — edit / cancel / restore (coach only). Partial
// update; RSVPs are preserved across edits (the card shows an "updated" tag
// via updated_at > created_at).
export async function PATCH(req: NextRequest) {
  const payload = (await req.json().catch(() => ({}))) as {
    teamId?: string
    eventId?: string
    type?: string
    startsAt?: string
    timeTbd?: boolean
    title?: string
    location?: string
    notes?: string
    status?: string
  }
  const teamId = (payload.teamId ?? '').toString()
  const eventId = (payload.eventId ?? '').toString()
  if (!teamId || !eventId) return NextResponse.json({ error: 'teamId and eventId required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  if (!actor.identity.isCoach) return NextResponse.json({ error: 'Coach only' }, { status: 403 })

  const event = await getEventById(eventId)
  if (!event || event.team_id !== teamId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Merge the partial update over the existing row in JS, then write every
  // column back — one static UPDATE, no dynamic SQL, no NULL-branching traps.
  let type = event.type
  if (payload.type !== undefined) {
    if (!(EVENT_TYPES as readonly string[]).includes(payload.type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }
    type = payload.type
  }

  let startsAt = new Date(event.starts_at)
  if (payload.startsAt !== undefined) {
    startsAt = new Date(payload.startsAt)
    if (isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: 'Invalid start time' }, { status: 400 })
    }
    if (isPastDay(startsAt)) {
      return NextResponse.json({ error: 'Events can’t start in the past' }, { status: 400 })
    }
  }

  let status = event.status
  if (payload.status !== undefined) {
    if (payload.status !== 'active' && payload.status !== 'cancelled') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    status = payload.status
  }

  const timeTbd = payload.timeTbd === undefined ? event.time_tbd : payload.timeTbd === true

  let title = event.title
  let location = event.location
  let notes = event.notes
  if (payload.title !== undefined) {
    const cleaned = cleanText(payload.title, 120)
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
    title = cleaned.value
  }
  if (payload.location !== undefined) {
    const cleaned = cleanText(payload.location, 200)
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
    location = cleaned.value
  }
  if (payload.notes !== undefined) {
    const cleaned = cleanText(payload.notes, 500)
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
    notes = cleaned.value
  }

  try {
    const [updated] = (await db`
      UPDATE team_events
      SET type = ${type},
          title = ${title},
          location = ${location},
          notes = ${notes},
          starts_at = ${startsAt.toISOString()},
          time_tbd = ${timeTbd},
          status = ${status},
          updated_at = NOW()
      WHERE id = ${eventId} AND team_id = ${teamId}
      RETURNING *
    `) as unknown as [TeamEventRow | undefined]
    if (!updated) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const [rsvps, roster] = await Promise.all([getRsvpsForEvents([eventId]), getRoster(teamId)])
    return NextResponse.json({ event: serializeEvent(updated, rsvps, roster, actor.userId) })
  } catch (err) {
    console.error('[team/schedule] update failed:', err)
    return NextResponse.json({ error: 'Could not update event' }, { status: 500 })
  }
}

// DELETE /api/team/schedule?teamId=&eventId= — hard delete (coach only).
// Two-step guard: only an already-cancelled event (or one nobody replied to)
// can be deleted, so a fat-fingered tap can't destroy an RSVP record.
export async function DELETE(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') ?? ''
  const eventId = req.nextUrl.searchParams.get('eventId') ?? ''
  if (!teamId || !eventId) return NextResponse.json({ error: 'teamId and eventId required' }, { status: 400 })

  const actor = await resolveChatActorFromRequest(req, teamId)
  if (!actor) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  if (!actor.identity.isCoach) return NextResponse.json({ error: 'Coach only' }, { status: 403 })

  const event = await getEventById(eventId)
  if (!event || event.team_id !== teamId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  try {
    if (event.status !== 'cancelled') {
      const [count] = (await db`
        SELECT COUNT(*)::int AS n FROM team_event_rsvps WHERE event_id = ${eventId}
      `) as unknown as [{ n: number }]
      if (Number(count?.n ?? 0) > 0) {
        return NextResponse.json({ error: 'Cancel the event first' }, { status: 409 })
      }
    }

    await db`DELETE FROM team_events WHERE id = ${eventId} AND team_id = ${teamId}`
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[team/schedule] delete failed:', err)
    return NextResponse.json({ error: 'Could not delete event' }, { status: 500 })
  }
}
