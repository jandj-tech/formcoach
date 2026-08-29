/**
 * iCalendar (RFC 5545) generation for team schedules.
 *
 * Pure — no database, no Next.js, no environment. Everything a calendar client
 * sees is decided here, which is also what makes it testable: see
 * scripts/test-ics.ts.
 *
 * Two rules in this format bite hard if you get them wrong, because the failure
 * is a calendar app silently refusing the whole feed rather than complaining:
 *
 *  - Lines are CRLF-terminated and folded at 75 OCTETS, not characters. A team
 *    name with an emoji or an accent counts for more than one, and a fold that
 *    lands mid-codepoint corrupts the file.
 *  - `\`, `;` and `,` are escaped inside text values, and real newlines become
 *    a literal `\n`. A location like "Gym B, Door 3" would otherwise read as
 *    two values.
 */

/**
 * team_events has a start but no end, so a duration is assumed per type.
 * These are display hints in someone's calendar, not a claim about when
 * practice actually finishes — but a calendar entry has to occupy something,
 * and a zero-length event renders as a hairline nobody can tap.
 */
export const EVENT_DURATION_MINUTES: Readonly<Record<string, number>> = {
  practice: 90,
  game: 120,
  other: 60,
}
const DEFAULT_DURATION_MINUTES = 60

/** The event fields a calendar entry is built from. */
export interface IcsEventInput {
  id: string
  type: string
  title: string | null
  location: string | null
  notes: string | null
  startsAt: Date
  timeTbd: boolean
  cancelled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface IcsCalendarInput {
  /** Shown as the calendar's name in Google and Apple Calendar. */
  name: string
  description?: string
  /** Deep link back to the team, attached to every event. */
  url?: string
  /** Domain used for UID uniqueness — not resolved, just an identifier. */
  uidDomain: string
  events: IcsEventInput[]
}

/** RFC 5545 §3.3.11 — escape the four characters with meaning in TEXT. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * RFC 5545 §3.1 — fold to 75 octets, continuation lines start with one space.
 *
 * Counted in UTF-8 bytes and never split mid-codepoint: a fold inside a
 * multi-byte character produces a file some clients reject outright and others
 * render as a replacement glyph in the team's name.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line

  const parts: string[] = []
  let start = 0
  // 75 octets on the first line, 74 thereafter — the leading space counts.
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Walk back off a continuation byte (10xxxxxx) so a codepoint stays whole.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    parts.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    limit = 74
  }
  return parts.join('\r\n ')
}

/** UTC form: 20260904T233000Z. */
function icsDateTimeUtc(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

/** Date-only form: 20260904. */
function icsDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000)
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * SEQUENCE must be a non-negative integer that only ever grows for a given UID,
 * or clients ignore the update. Seconds since the event was created does that
 * without storing a revision counter: every edit bumps updated_at.
 */
function sequenceOf(event: IcsEventInput): number {
  const seconds = Math.floor((event.updatedAt.getTime() - event.createdAt.getTime()) / 1000)
  return seconds > 0 ? seconds : 0
}

function buildEventLines(event: IcsEventInput, input: IcsCalendarInput): string[] {
  const lines: string[] = ['BEGIN:VEVENT']
  lines.push(`UID:${event.id}@${input.uidDomain}`)
  lines.push(`DTSTAMP:${icsDateTimeUtc(event.updatedAt)}`)

  if (event.timeTbd) {
    // "Time TBD" is exactly what an all-day entry means, so that is what it
    // becomes rather than a made-up start time on someone's real calendar.
    //
    // The date comes from the stored instant, which the create form anchors at
    // local noon precisely so it survives the round trip. That holds for every
    // offset from UTC-11 to UTC+12; at UTC+13/+14 the UTC date is a day
    // behind. No team here is in those zones, and the alternative — inventing
    // a start time — is wrong for everyone.
    const day = event.startsAt
    lines.push(`DTSTART;VALUE=DATE:${icsDateUtc(day)}`)
    // DTEND is exclusive: an all-day event ends on the following date.
    lines.push(`DTEND;VALUE=DATE:${icsDateUtc(addDaysUtc(day, 1))}`)
  } else {
    const minutes = EVENT_DURATION_MINUTES[event.type] ?? DEFAULT_DURATION_MINUTES
    lines.push(`DTSTART:${icsDateTimeUtc(event.startsAt)}`)
    lines.push(`DTEND:${icsDateTimeUtc(new Date(event.startsAt.getTime() + minutes * 60_000))}`)
  }

  const summary = event.title?.trim() || titleCase(event.type)
  // A cancelled event stays in the feed with STATUS:CANCELLED so subscribers
  // see it struck through and stop showing up, rather than it vanishing and
  // leaving them to guess. The prefix is for clients that ignore STATUS.
  lines.push(`SUMMARY:${escapeIcsText(event.cancelled ? `CANCELLED: ${summary}` : summary)}`)
  lines.push(`STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`)

  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`)

  const description = [
    event.notes?.trim() || '',
    event.timeTbd ? 'Start time to be confirmed.' : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`)

  if (input.url) lines.push(`URL:${escapeIcsText(input.url)}`)
  lines.push(`SEQUENCE:${sequenceOf(event)}`)
  lines.push(`LAST-MODIFIED:${icsDateTimeUtc(event.updatedAt)}`)
  lines.push(`CREATED:${icsDateTimeUtc(event.createdAt)}`)
  lines.push('END:VEVENT')
  return lines
}

/** A complete VCALENDAR document, CRLF-terminated and folded, ready to serve. */
export function buildTeamCalendar(input: IcsCalendarInput): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LearnHoops//Team Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // X-WR-CALNAME is non-standard but is what Google and Apple actually read
    // to name a subscribed calendar; without it the feed shows up as its URL.
    `X-WR-CALNAME:${escapeIcsText(input.name)}`,
    // Clients poll a subscribed feed on their own schedule — daily by default
    // in Google. Both spellings ask for hourly; neither is a guarantee, which
    // is why a cancelled event stays in the feed rather than disappearing.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  if (input.description) lines.push(`X-WR-CALDESC:${escapeIcsText(input.description)}`)

  for (const event of input.events) lines.push(...buildEventLines(event, input))
  lines.push('END:VCALENDAR')

  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
