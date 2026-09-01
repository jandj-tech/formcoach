/**
 * Player plan sweep — run with `npx tsx scripts/test-player-plans.ts`.
 *
 * lib/player-plans.ts is pure (no DB, no Stripe), so this needs no env. It
 * pins the plan prices, the dual weekly+monthly quota decision, the
 * billing-anchored window math (including month-end clamping and timezone
 * independence), no-rollover, and the consistency/streak formulas.
 */
import {
  PLAYER_PLANS,
  playerPlanTotalCents,
  playerAnnualPerMonthCents,
  playerAnnualSavingsCents,
  playerAnnualPercentOff,
  planAllowanceLabel,
  playerStatusEntitled,
  quotaDecision,
  weeklyWindow,
  monthlyWindow,
  addMonthsClamped,
  weekStartUtc,
  consistencyScore,
  currentStreakWeeks,
  activeWeeksCount,
  isPlayerPlan,
  formatMinutes,
  type WeekActivity,
} from '../lib/player-plans'
import { parseTrainingInput } from '../lib/training'

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

// --- prices (the product promise) --------------------------------------------
check('Player monthly = $18.95', PLAYER_PLANS.player.monthlyCents === 1895)
check('Player yearly = $199', PLAYER_PLANS.player.annualTotalCents === 19900)
check('Pro monthly = $28.95', PLAYER_PLANS.pro.monthlyCents === 2895)
check('Pro yearly = $299', PLAYER_PLANS.pro.annualTotalCents === 29900)
check('Player limits 2/wk, 6/mo', PLAYER_PLANS.player.weeklyLimit === 2 && PLAYER_PLANS.player.monthlyLimit === 6)
check('Pro limits 5/wk, 15/mo', PLAYER_PLANS.pro.weeklyLimit === 5 && PLAYER_PLANS.pro.monthlyLimit === 15)
check('interval totals dispatch', playerPlanTotalCents('player', 'monthly') === 1895 && playerPlanTotalCents('player', 'annual') === 19900)

// Savings are CALCULATED — the pages advertise what these return, so pin the
// arithmetic, not a hand-typed percentage.
check('Player annual ≈ $16.58/mo', playerAnnualPerMonthCents('player') === 1658)
check('Pro annual ≈ $24.92/mo', playerAnnualPerMonthCents('pro') === 2492)
check('Player annual saves $28.40 = 12%', playerAnnualSavingsCents('player') === 2840 && playerAnnualPercentOff('player') === 12)
check('Pro annual saves $48.40 = 14%', playerAnnualSavingsCents('pro') === 4840 && playerAnnualPercentOff('pro') === 14)

// The caps language must always carry BOTH numbers.
check(
  'allowance label names both caps',
  planAllowanceLabel('player') === '2 analyses per week, up to 6 per month' &&
    planAllowanceLabel('pro') === '5 analyses per week, up to 15 per month',
  planAllowanceLabel('player'),
)

for (const good of ['player', 'pro']) check(`isPlayerPlan('${good}')`, isPlayerPlan(good))
for (const bad of ['PRO', 'basic', '', null, undefined]) check(`isPlayerPlan(${JSON.stringify(bad)}) is false`, !isPlayerPlan(bad))

// --- entitled statuses -------------------------------------------------------
for (const s of ['active', 'trialing', 'past_due']) check(`status '${s}' entitled`, playerStatusEntitled(s))
for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', null, undefined, '']) {
  check(`status ${JSON.stringify(s)} NOT entitled`, !playerStatusEntitled(s))
}

// --- the dual-cap quota decision (spec PART 37 matrix) -------------------------
const QUOTA: Array<['player' | 'pro', number, number, boolean, string?]> = [
  // plan, weeklyUsed, monthlyUsed, allowed, blockedBy
  ['player', 0, 0, true],
  ['player', 2, 3, false, 'weekly'],
  ['player', 1, 6, false, 'monthly'],
  ['player', 1, 5, true],
  ['pro', 4, 14, true],
  ['pro', 5, 10, false, 'weekly'],
  ['pro', 3, 15, false, 'monthly'],
  // Both exhausted: monthly wins the tie (a weekly reset can't help).
  ['player', 2, 6, false, 'monthly'],
]
for (const [plan, w, m, allowed, blockedBy] of QUOTA) {
  const d = quotaDecision(plan, w, m)
  check(
    `quota ${plan} ${w}wk/${m}mo -> ${allowed ? 'allowed' : `blocked (${blockedBy})`}`,
    d.allowed === allowed && (allowed || d.blockedBy === blockedBy),
    `got ${JSON.stringify(d)}`,
  )
}
// Remaining figures are the min-driven display numbers.
{
  const d = quotaDecision('player', 1, 4)
  check('remaining figures', d.weeklyRemaining === 1 && d.monthlyRemaining === 2, JSON.stringify(d))
}

// --- window math ---------------------------------------------------------------
const anchor = new Date('2026-09-14T10:00:00Z') // "subscribes September 14"

// Weekly: consecutive 7-day windows from the anchor, no gaps, no overlap.
{
  const w0 = weeklyWindow(anchor, new Date('2026-09-14T10:00:00Z'))
  const w0b = weeklyWindow(anchor, new Date('2026-09-21T09:59:59Z'))
  const w1 = weeklyWindow(anchor, new Date('2026-09-21T10:00:00Z'))
  check('weekly window 0 starts at the anchor', w0.start.getTime() === anchor.getTime())
  check('weekly window is 7 days', w0.end.getTime() - w0.start.getTime() === 7 * 86400_000)
  check('weekly windows are stable inside', w0b.start.getTime() === w0.start.getTime())
  check('weekly windows abut exactly (no rollover gap)', w1.start.getTime() === w0.end.getTime())
  // Clock skew safety: a "now" before the anchor still yields window 0.
  const early = weeklyWindow(anchor, new Date('2026-09-14T09:00:00Z'))
  check('pre-anchor now clamps to window 0', early.start.getTime() === anchor.getTime())
}

// Monthly: billing months Sep 14 → Oct 14 → Nov 14 (the spec's own example).
{
  const m0 = monthlyWindow(anchor, new Date('2026-09-20T00:00:00Z'))
  check('Sep 14 subscriber: month 1 is Sep 14 → Oct 14', m0.start.toISOString() === '2026-09-14T10:00:00.000Z' && m0.end.toISOString() === '2026-10-14T10:00:00.000Z')
  const mLate = monthlyWindow(anchor, new Date('2026-10-14T09:59:59Z'))
  check('Oct 13 (spec: “October 13 = billing month 1”) still month 1', mLate.start.getTime() === m0.start.getTime())
  const m1 = monthlyWindow(anchor, new Date('2026-10-14T10:00:00Z'))
  check('monthly windows abut exactly (no rollover)', m1.start.getTime() === m0.end.getTime())
}

// Month-end clamping: a Jan 31 anchor bills Feb 28 (2026 is not a leap year),
// then Mar 31 — exactly how Stripe advances the cycle.
{
  const eom = new Date('2026-01-31T05:00:00Z')
  check('addMonthsClamped Jan31+1 = Feb 28', addMonthsClamped(eom, 1).toISOString() === '2026-02-28T05:00:00.000Z')
  check('addMonthsClamped Jan31+2 = Mar 31', addMonthsClamped(eom, 2).toISOString() === '2026-03-31T05:00:00.000Z')
  const feb = monthlyWindow(eom, new Date('2026-02-15T00:00:00Z'))
  check('Feb window is [Jan 31, Feb 28)', feb.start.toISOString() === '2026-01-31T05:00:00.000Z' && feb.end.toISOString() === '2026-02-28T05:00:00.000Z')
  const mar = monthlyWindow(eom, new Date('2026-03-01T00:00:00Z'))
  check('Mar window starts Feb 28', mar.start.toISOString() === '2026-02-28T05:00:00.000Z')
}

// An ANNUAL subscriber gets the same monthly windows — a year in, the window
// is month 12, not one giant year-long bank.
{
  const yearIn = monthlyWindow(anchor, new Date('2027-09-13T00:00:00Z'))
  check('annual: month 12 window is Aug 14 → Sep 14 next year', yearIn.start.toISOString() === '2027-08-14T10:00:00.000Z' && yearIn.end.toISOString() === '2027-09-14T10:00:00.000Z')
}

// Timezone independence: the same instants, expressed differently, land in the
// same windows — windows derive from UTC arithmetic on the anchor only.
{
  const a = weeklyWindow(anchor, new Date('2026-09-20T23:30:00-07:00'))
  const b = weeklyWindow(anchor, new Date('2026-09-21T02:30:00-04:00'))
  check('same instant, different tz notation, same window', a.start.getTime() === b.start.getTime())
}

// Continuity sweep: 400 days of hourly steps — every now is inside exactly one
// weekly and one monthly window, and windows never regress.
{
  let ok = true
  let prevWeek = 0
  let prevMonth = 0
  for (let h = 0; h < 400 * 24; h += 7) {
    const now = new Date(anchor.getTime() + h * 3600_000)
    const w = weeklyWindow(anchor, now)
    const m = monthlyWindow(anchor, now)
    if (!(w.start <= now && now < w.end) || !(m.start <= now && now < m.end)) { ok = false; break }
    if (w.start.getTime() < prevWeek || m.start.getTime() < prevMonth) { ok = false; break }
    prevWeek = w.start.getTime()
    prevMonth = m.start.getTime()
  }
  check('400-day sweep: every instant falls in exactly one non-regressing window pair', ok)
}

// --- consistency & streaks -----------------------------------------------------
const NOW = new Date('2026-09-01T12:00:00Z') // a Tuesday; week starts Mon Aug 31
const wk = (offset: number, a = 0, f = 0, b = 0): WeekActivity => {
  const start = new Date(weekStartUtc(NOW).getTime() - offset * 7 * 86400_000)
  return { weekStart: start.toISOString().slice(0, 10), analyses: a, formMinutes: f, basketballMinutes: b }
}

check('weekStartUtc lands on Monday', weekStartUtc(NOW).toISOString() === '2026-08-31T00:00:00.000Z')
check('weekStartUtc of a Sunday goes back 6 days', weekStartUtc(new Date('2026-09-06T23:00:00Z')).toISOString() === '2026-08-31T00:00:00.000Z')

// Four fully-active weeks = 100. One perfect week = 25 — volume can never
// outscore showing up across weeks.
check('4 full weeks = 100', consistencyScore([wk(0, 1, 30, 60), wk(1, 2, 45, 30), wk(2, 1, 10, 600), wk(3, 1, 5, 5)], NOW) === 100)
check('1 giant week = 25', consistencyScore([wk(0, 12, 600, 600)], NOW) === 25)
check('4 analysis-only weeks (40) beat 1 giant week (25)', consistencyScore([wk(0, 1), wk(1, 1), wk(2, 1), wk(3, 1)], NOW) > 25)
check('week 5+ does not count', consistencyScore([wk(4, 5, 500, 500)], NOW) === 0)
check('empty = 0', consistencyScore([], NOW) === 0)
check('partial week points: analysis 10 + form 8', consistencyScore([wk(1, 1, 30, 0)], NOW) === 18)

// Streaks: current week extends but never breaks; a quiet completed week breaks.
check('streak: current + 2 prior = 3', currentStreakWeeks([wk(0, 1), wk(1, 0, 30), wk(2, 0, 0, 45)], NOW) === 3)
check('streak survives a quiet current week', currentStreakWeeks([wk(1, 1), wk(2, 1)], NOW) === 2)
check('streak breaks on a quiet completed week', currentStreakWeeks([wk(0, 1), wk(2, 1)], NOW) === 1)
check('no activity = 0 streak', currentStreakWeeks([], NOW) === 0)
check('active weeks of last 8', activeWeeksCount([wk(0, 1), wk(3, 0, 20), wk(7, 2), wk(9, 5)], NOW, 8) === 3)

// --- training input validation --------------------------------------------------
const today = new Date().toISOString().slice(0, 10)
{
  const ok = parseTrainingInput({ activityType: 'form_work', durationMinutes: 45, activityDate: today, note: 'Guide-hand placement' })
  check('valid entry parses', 'input' in ok && ok.input.durationMinutes === 45)
}
check('rejects unknown type', 'error' in parseTrainingInput({ activityType: 'yoga', durationMinutes: 30, activityDate: today }))
check('rejects zero minutes', 'error' in parseTrainingInput({ activityType: 'basketball', durationMinutes: 0, activityDate: today }))
check('rejects >12h', 'error' in parseTrainingInput({ activityType: 'basketball', durationMinutes: 721, activityDate: today }))
check('rejects fractional minutes', 'error' in parseTrainingInput({ activityType: 'basketball', durationMinutes: 30.5, activityDate: today }))
check('rejects future date', 'error' in parseTrainingInput({ activityType: 'basketball', durationMinutes: 30, activityDate: '2999-01-01' }))
check('rejects ancient date', 'error' in parseTrainingInput({ activityType: 'basketball', durationMinutes: 30, activityDate: '2020-01-01' }))
check('rejects malformed date', 'error' in parseTrainingInput({ activityType: 'basketball', durationMinutes: 30, activityDate: '2026-02-30' }))
check('note is optional', 'input' in parseTrainingInput({ activityType: 'basketball', durationMinutes: 30, activityDate: today }))

// --- display helpers -------------------------------------------------------------
check('formatMinutes 90 = 1h 30m', formatMinutes(90) === '1h 30m')
check('formatMinutes 45 = 45m', formatMinutes(45) === '45m')
check('formatMinutes 180 = 3h', formatMinutes(180) === '3h')

// --- report ----------------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  FAIL  ${f}`)
process.exit(failures.length > 0 ? 1 : 0)
