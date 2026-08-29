/**
 * Tests for the iCalendar generator.
 *
 * Run: npx tsx scripts/test-ics.ts
 *
 * This is the gate that matters for calendar feeds, because the failure mode
 * is not an exception — it is Google or Apple quietly refusing to add the
 * calendar, or adding it with a mangled name, with no error anyone can see.
 * Everything asserted here is something a real client rejects or renders
 * wrong when it's absent.
 */

import {
  buildTeamCalendar,
  escapeIcsText,
  foldIcsLine,
  type IcsEventInput,
} from '../lib/ics'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
}

const baseEvent: IcsEventInput = {
  id: '11111111-2222-3333-4444-555555555555',
  type: 'practice',
  title: 'Shooting practice',
  location: 'Gym B, Door 3; ring the bell',
  notes: 'Bring a light and a dark shirt.',
  startsAt: new Date('2026-09-04T23:30:00.000Z'),
  timeTbd: false,
  cancelled: false,
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  updatedAt: new Date('2026-08-02T12:00:00.000Z'),
}

function build(events: IcsEventInput[], name = 'Test Team Schedule') {
  return buildTeamCalendar({ name, uidDomain: 'learnhoops.com', url: 'https://x/team', events })
}

// --- escaping ---------------------------------------------------------------
console.log('\nText escaping (RFC 5545 §3.3.11)')
eq('backslash', escapeIcsText('a\\b'), 'a\\\\b')
eq('semicolon', escapeIcsText('a;b'), 'a\\;b')
eq('comma', escapeIcsText('a,b'), 'a\\,b')
eq('newline', escapeIcsText('a\nb'), 'a\\nb')
eq('CRLF is one escape', escapeIcsText('a\r\nb'), 'a\\nb')
eq('colon is NOT escaped', escapeIcsText('a:b'), 'a:b')
// Order matters: escaping the backslash last would double-escape the others.
eq('backslash before comma', escapeIcsText('a\\,b'), 'a\\\\\\,b')

// --- folding ----------------------------------------------------------------
console.log('\nLine folding (RFC 5545 §3.1)')
const short = 'SUMMARY:short'
eq('short line untouched', foldIcsLine(short), short)

const long = 'SUMMARY:' + 'a'.repeat(200)
const foldedLines = foldIcsLine(long).split('\r\n')
check('long line is folded', foldedLines.length > 1)
check(
  'no line exceeds 75 octets',
  foldedLines.every(l => Buffer.byteLength(l, 'utf8') <= 75),
  foldedLines.map(l => Buffer.byteLength(l, 'utf8')).join(','),
)
check('continuations start with a space', foldedLines.slice(1).every(l => l.startsWith(' ')))
eq('unfolds to the original', foldedLines.map((l, i) => (i ? l.slice(1) : l)).join(''), long)

// A fold that lands mid-codepoint corrupts the file; emoji are 4 bytes each.
const emoji = 'SUMMARY:' + '🏀'.repeat(40)
const emojiLines = foldIcsLine(emoji).split('\r\n')
check(
  'emoji: no line exceeds 75 octets',
  emojiLines.every(l => Buffer.byteLength(l, 'utf8') <= 75),
)
check('emoji: no replacement characters', !foldIcsLine(emoji).includes('�'))
eq(
  'emoji: unfolds to the original',
  emojiLines.map((l, i) => (i ? l.slice(1) : l)).join(''),
  emoji,
)

// --- calendar envelope ------------------------------------------------------
console.log('\nCalendar envelope')
const cal = build([baseEvent])
check('begins VCALENDAR', cal.startsWith('BEGIN:VCALENDAR\r\n'))
check('ends VCALENDAR', cal.endsWith('END:VCALENDAR\r\n'))
check('VERSION:2.0', cal.includes('VERSION:2.0'))
check('has PRODID', cal.includes('PRODID:'))
// Without X-WR-CALNAME the subscription shows up named after its URL.
check('names the calendar', cal.includes('X-WR-CALNAME:Test Team Schedule'))
check('asks for hourly refresh', cal.includes('REFRESH-INTERVAL;VALUE=DURATION:PT1H'))
check('and the Apple spelling', cal.includes('X-PUBLISHED-TTL:PT1H'))
check('CRLF throughout', !/[^\r]\n/.test(cal))

// --- a timed event ----------------------------------------------------------
console.log('\nTimed event')
check('UID is qualified', cal.includes(`UID:${baseEvent.id}@learnhoops.com`))
check('DTSTART in UTC', cal.includes('DTSTART:20260904T233000Z'))
// practice = 90 minutes → 23:30 + 1:30 = 01:00 the next day.
check('DTEND uses the practice duration', cal.includes('DTEND:20260905T010000Z'))
check('STATUS:CONFIRMED', cal.includes('STATUS:CONFIRMED'))
check('escapes the location', cal.includes('LOCATION:Gym B\\, Door 3\\; ring the bell'))
check('carries notes', cal.includes('DESCRIPTION:Bring a light and a dark shirt.'))
// updatedAt - createdAt = 86400s. Must grow on edit or clients ignore updates.
check('SEQUENCE grows with edits', cal.includes('SEQUENCE:86400'))

const gameCal = build([{ ...baseEvent, type: 'game' }])
check('game runs 120 minutes', gameCal.includes('DTEND:20260905T013000Z'))
const otherCal = build([{ ...baseEvent, type: 'other' }])
check('other runs 60 minutes', otherCal.includes('DTEND:20260905T003000Z'))
const unknownCal = build([{ ...baseEvent, type: 'scrimmage' }])
check('an unknown type still gets a duration', unknownCal.includes('DTEND:20260905T003000Z'))

// --- time TBD ---------------------------------------------------------------
console.log('\nTime TBD → all-day')
const tbd = build([{ ...baseEvent, timeTbd: true, startsAt: new Date('2026-09-04T16:00:00.000Z') }])
check('DTSTART is a DATE', tbd.includes('DTSTART;VALUE=DATE:20260904'))
// DTEND is exclusive — the day after, or the event renders as zero-length.
check('DTEND is the next day', tbd.includes('DTEND;VALUE=DATE:20260905'))
check('no invented start time', !tbd.includes('DTSTART:20260904T'))
check('says the time is unconfirmed', tbd.includes('Start time to be confirmed.'))

// --- cancelled --------------------------------------------------------------
console.log('\nCancelled event')
const cancelled = build([{ ...baseEvent, cancelled: true }])
check('STATUS:CANCELLED', cancelled.includes('STATUS:CANCELLED'))
// Still present: vanishing from the feed tells a subscriber nothing.
check('still in the feed', cancelled.includes(`UID:${baseEvent.id}@learnhoops.com`))
check('and says so in the title', cancelled.includes('SUMMARY:CANCELLED: Shooting practice'))

// --- untitled ---------------------------------------------------------------
console.log('\nFallbacks')
const untitled = build([{ ...baseEvent, title: null, notes: null, location: null }])
check('falls back to the type', untitled.includes('SUMMARY:Practice'))
check('omits an empty LOCATION', !untitled.includes('LOCATION:'))
check('omits an empty DESCRIPTION', !untitled.includes('DESCRIPTION:'))
const blankTitle = build([{ ...baseEvent, title: '   ' }])
check('whitespace title falls back too', blankTitle.includes('SUMMARY:Practice'))

// A created-and-never-edited event must not get a negative SEQUENCE.
const fresh = build([{ ...baseEvent, updatedAt: baseEvent.createdAt }])
check('SEQUENCE:0 when never edited', fresh.includes('SEQUENCE:0'))
const clockSkew = build([
  { ...baseEvent, updatedAt: new Date(baseEvent.createdAt.getTime() - 5000) },
])
check(
  'SEQUENCE never goes negative',
  clockSkew.includes('SEQUENCE:0') && !clockSkew.includes('SEQUENCE:-'),
)

// --- structure --------------------------------------------------------------
console.log('\nMultiple events')
const many = build([baseEvent, { ...baseEvent, id: 'aaaa-bbbb', title: 'Game day' }])
eq('one BEGIN:VEVENT each', (many.match(/BEGIN:VEVENT/g) || []).length, 2)
eq('one END:VEVENT each', (many.match(/END:VEVENT/g) || []).length, 2)
const empty = build([])
check(
  'an empty schedule is still a valid calendar',
  empty.includes('BEGIN:VCALENDAR') && empty.includes('END:VCALENDAR'),
)
check('and has no events', !empty.includes('BEGIN:VEVENT'))

// A team name with a comma must not break the calendar name into two values.
const commaName = build([baseEvent], 'Riverside Ravens, U14')
check('escapes the calendar name', commaName.includes('X-WR-CALNAME:Riverside Ravens\\, U14'))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
