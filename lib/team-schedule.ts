import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Team schedule server helpers. Auth is NOT here on purpose — every schedule
// route reuses resolveChatActorFromRequest from lib/team-chat.ts, which
// already resolves all three session types (player user session, coach team
// session, org session over an org-owned team). The naming is chat-flavored
// but the semantics — "who is this actor on this team" — are exactly what
// schedule needs.
// ---------------------------------------------------------------------------

export const EVENT_TYPES = ['practice', 'game', 'other'] as const
export type EventType = (typeof EVENT_TYPES)[number]

/** Raw team_events row as returned by postgres. */
export interface TeamEventRow {
  id: string
  team_id: string
  type: string
  title: string | null
  location: string | null
  notes: string | null
  starts_at: string | Date
  time_tbd: boolean
  status: string
  created_by_email: string
  created_at: string | Date
  updated_at: string | Date
}

/** Raw team_event_rsvps row. */
export interface RsvpRow {
  event_id: string
  user_id: string
  status: string // 'in' | 'out'
  note: string | null
}

/** One roster member (name parts pre-COALESCEd in SQL, like the chat route). */
export interface RosterMember {
  id: string
  first_name: string
  last_name_initial: string
}

/** Wire format shared verbatim by web + app. */
export interface ScheduleEvent {
  id: string
  type: EventType
  title: string | null
  location: string | null
  notes: string | null
  startsAt: string // ISO 8601
  timeTbd: boolean
  status: 'active' | 'cancelled'
  locked: boolean // starts_at has passed → RSVP frozen
  createdAt: string
  updatedAt: string // updatedAt > createdAt → render an "updated" tag
  counts: { in: number; out: number; noReply: number }
  going: Array<{ userId: string; name: string; note: string | null }>
  out: Array<{ userId: string; name: string; note: string | null }>
  noReply: Array<{ userId: string; name: string }>
  /** null for coach/org sessions & non-repliers. */
  myRsvp: { status: 'in' | 'out'; note: string | null } | null
}

/** RSVPs freeze the moment the event starts — the list becomes attendance. */
export function isEventLocked(event: Pick<TeamEventRow, 'starts_at'>): boolean {
  return new Date(event.starts_at) <= new Date()
}

/** Same display-name rule as chat: "Jordan B." — email fallback baked into SQL. */
function displayName(member: Pick<RosterMember, 'first_name' | 'last_name_initial'>): string {
  return member.last_name_initial
    ? `${member.first_name} ${member.last_name_initial.charAt(0)}.`
    : member.first_name
}

/** Team roster with pre-formatted name parts (same SQL as the chat GET). */
export async function getRoster(teamId: string): Promise<RosterMember[]> {
  return (await db`
    SELECT u.id,
           COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
           COALESCE(tm.last_name_initial, '') AS last_name_initial
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ${teamId}
    ORDER BY tm.first_name ASC NULLS LAST
  `) as unknown as RosterMember[]
}

/**
 * Builds the wire shape for one event. `noReply` = roster minus users with an
 * RSVP row. RSVPs from users who since left the team still count but can't be
 * named from the roster — they render as "Player".
 */
export function serializeEvent(
  row: TeamEventRow,
  rsvpRows: RsvpRow[],
  roster: RosterMember[],
  myUserId: string | null,
): ScheduleEvent {
  const nameById = new Map(roster.map(m => [m.id, displayName(m)]))
  const replied = new Set<string>()
  const going: ScheduleEvent['going'] = []
  const out: ScheduleEvent['out'] = []
  let myRsvp: ScheduleEvent['myRsvp'] = null

  for (const r of rsvpRows) {
    if (r.event_id !== row.id) continue
    replied.add(r.user_id)
    const entry = {
      userId: r.user_id,
      name: nameById.get(r.user_id) ?? 'Player',
      note: r.note ?? null,
    }
    if (r.status === 'in') going.push(entry)
    else if (r.status === 'out') out.push(entry)
    if (myUserId && r.user_id === myUserId && (r.status === 'in' || r.status === 'out')) {
      myRsvp = { status: r.status, note: r.note ?? null }
    }
  }

  const noReply = roster
    .filter(m => !replied.has(m.id))
    .map(m => ({ userId: m.id, name: displayName(m) }))

  return {
    id: row.id,
    type: (EVENT_TYPES as readonly string[]).includes(row.type) ? (row.type as EventType) : 'other',
    title: row.title,
    location: row.location,
    notes: row.notes,
    startsAt: new Date(row.starts_at).toISOString(),
    timeTbd: row.time_tbd,
    status: row.status === 'cancelled' ? 'cancelled' : 'active',
    locked: isEventLocked(row),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    counts: { in: going.length, out: out.length, noReply: noReply.length },
    going,
    out,
    noReply,
    myRsvp,
  }
}

/** Minutes-east-of-UTC style offset (in ms) of `timeZone` at `instant`. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - instant.getTime()
}

/**
 * start + N×7 days keeping the same LOCAL wall-clock time in `timeZone` —
 * a weekly 6:00 PM practice stays 6:00 PM across a DST switch. Without a
 * (valid) timezone we fall back to flat UTC arithmetic.
 */
export function addWeeksPreservingWallClock(start: Date, weeks: number, timeZone: string | null): Date {
  const naive = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
  if (!timeZone || weeks === 0) return naive
  try {
    const diff = tzOffsetMs(start, timeZone) - tzOffsetMs(naive, timeZone)
    return new Date(naive.getTime() + diff)
  } catch {
    // Unknown/garbage IANA name — Intl throws; keep the naive occurrence.
    return naive
  }
}

/** All RSVP rows for a set of events in ONE query (no N+1). */
export async function getRsvpsForEvents(eventIds: string[]): Promise<RsvpRow[]> {
  if (eventIds.length === 0) return []
  return (await db`
    SELECT event_id, user_id, status, note
    FROM team_event_rsvps
    WHERE event_id = ANY(${eventIds})
  `) as unknown as RsvpRow[]
}

/** Loads one event by id; invalid UUIDs and misses both return null. */
export async function getEventById(eventId: string): Promise<TeamEventRow | null> {
  try {
    const [row] = (await db`
      SELECT * FROM team_events WHERE id = ${eventId} LIMIT 1
    `) as unknown as [TeamEventRow | undefined]
    return row ?? null
  } catch {
    // Non-UUID input makes postgres throw — treat as not found.
    return null
  }
}
