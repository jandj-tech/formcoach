/**
 * Org membership pricing sweep — run with
 * `npx tsx scripts/test-org-membership-pricing.ts`.
 *
 * lib/org-membership-pricing.ts is pure, so this needs no env. It pins the
 * final price table, the per-month monotonicity rules (by term and by tier),
 * the minimum-order rule, and top-up tiering (live seats + new seats).
 */
import {
  MEMBERSHIP_PRICE_CENTS,
  MEMBERSHIP_TERMS,
  MEMBERSHIP_TIERS,
  MIN_MEMBERSHIP_SEATS,
  membershipEndsAt,
  membershipQuote,
  membershipPerMonthCents,
  membershipRetailCents,
  membershipRetailMonthlyCents,
  membershipSavingsPercent,
  membershipSeatsError,
  membershipTierFor,
  termMonths,
  type MembershipPlan,
  type MembershipTerm,
} from '../lib/org-membership-pricing'

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}
function throws(fn: () => unknown): boolean {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

const plans: MembershipPlan[] = ['player', 'pro']
const terms: MembershipTerm[] = ['m3', 'm6', 'm12']

// --- the final table (MEMBERSHIP-PRICING.md) ----------------------------------
const expected: Record<MembershipPlan, Record<MembershipTerm, number[]>> = {
  player: { m3: [4200, 3900, 3600], m6: [7500, 6900, 6500], m12: [14900, 13500, 12900] },
  pro: { m3: [7200, 6700, 6200], m6: [12900, 11900, 11200], m12: [24900, 22900, 21900] },
}
for (const p of plans) for (const t of terms) {
  check(`table ${p}/${t}`, JSON.stringify(MEMBERSHIP_PRICE_CENTS[p][t]) === JSON.stringify(expected[p][t]),
    JSON.stringify(MEMBERSHIP_PRICE_CENTS[p][t]))
}
check('trimmed: Player Year 25+ = $135', MEMBERSHIP_PRICE_CENTS.player.m12[1] === 13500)
check('trimmed: Pro Year 25+ = $229', MEMBERSHIP_PRICE_CENTS.pro.m12[1] === 22900)
check('trimmed: Pro Year 50+ = $219', MEMBERSHIP_PRICE_CENTS.pro.m12[2] === 21900)
check('terms = 3/6/12', MEMBERSHIP_TERMS.map((t) => `${t.id}:${t.months}:${t.label}`).join(',') === 'm3:3:3 months,m6:6:6 months,m12:12:12 months')
check('tiers = 10/25/50', MEMBERSHIP_TIERS.join(',') === '10,25,50')
check('min seats = 10', MIN_MEMBERSHIP_SEATS === 10)

// --- monotonic per-month (exact rational comparison, no rounding) --------------
for (const p of plans) {
  for (let i = 0; i < 3; i++) {
    // by term: 3 > 6 > 12 per month, in every tier
    for (let a = 0; a < terms.length - 1; a++) {
      const t1 = terms[a], t2 = terms[a + 1]
      const lhs = MEMBERSHIP_PRICE_CENTS[p][t1][i] * termMonths(t2)
      const rhs = MEMBERSHIP_PRICE_CENTS[p][t2][i] * termMonths(t1)
      check(`${p} tier${MEMBERSHIP_TIERS[i]} per-month ${t1} > ${t2}`, lhs > rhs, `${lhs} vs ${rhs}`)
    }
  }
  for (const t of terms) {
    // by tier: 10+ > 25+ > 50+, in every term
    const row = MEMBERSHIP_PRICE_CENTS[p][t]
    check(`${p}/${t} tier prices strictly fall`, row[0] > row[1] && row[1] > row[2], row.join(','))
  }
}
// Pro always dearer than Player; every cell below retail
for (const t of terms) for (let i = 0; i < 3; i++) {
  check(`pro > player ${t}[${i}]`, MEMBERSHIP_PRICE_CENTS.pro[t][i] > MEMBERSHIP_PRICE_CENTS.player[t][i])
  for (const p of plans) {
    check(`${p}/${t}[${i}] below retail`, MEMBERSHIP_PRICE_CENTS[p][t][i] < membershipRetailCents(p, t))
  }
}
check('retail player m3 = 3 x $18.95', membershipRetailCents('player', 'm3') === 5685)
check('retail pro m3 = 3 x $28.95', membershipRetailCents('pro', 'm3') === 8685)
check('retail player m12 = 12 x $18.95 (monthly, not the $199 annual plan)', membershipRetailCents('player', 'm12') === 22740)
check('retail pro m12 = 12 x $28.95', membershipRetailCents('pro', 'm12') === 34740)
check('retail monthly = $18.95 / $28.95', membershipRetailMonthlyCents('player') === 1895 && membershipRetailMonthlyCents('pro') === 2895)
for (const p of plans) for (const t of terms) {
  check(`${p}/${t} retail = monthly x months`, membershipRetailCents(p, t) === membershipRetailMonthlyCents(p) * termMonths(t))
}

// --- savings read sensibly: they grow with the term and with the tier ------------
// Exact (unrounded) savings strictly grow; the whole-percent labels never go
// down (two neighbours can round to the same %, e.g. Player 6 vs 12 months).
const exactSaving = (p: MembershipPlan, t: MembershipTerm, i: number) =>
  1 - MEMBERSHIP_PRICE_CENTS[p][t][i] / membershipRetailCents(p, t)
const pct = (p: MembershipPlan, t: MembershipTerm, i: number) =>
  membershipSavingsPercent(p, t, MEMBERSHIP_PRICE_CENTS[p][t][i])
for (const p of plans) {
  for (let i = 0; i < 3; i++) {
    for (let a = 0; a < terms.length - 1; a++) {
      const t1 = terms[a], t2 = terms[a + 1]
      check(`${p} tier${MEMBERSHIP_TIERS[i]} saving grows ${t1} -> ${t2}`, exactSaving(p, t2, i) > exactSaving(p, t1, i) && pct(p, t2, i) >= pct(p, t1, i), `${pct(p, t1, i)}% vs ${pct(p, t2, i)}%`)
    }
    check(`${p} tier${MEMBERSHIP_TIERS[i]} saving 12 mo > 3 mo (whole %)`, pct(p, 'm12', i) > pct(p, 'm3', i))
  }
  for (const t of terms) {
    for (let i = 0; i < 2; i++) {
      check(`${p}/${t} saving grows tier ${MEMBERSHIP_TIERS[i]} -> ${MEMBERSHIP_TIERS[i + 1]}`, exactSaving(p, t, i + 1) > exactSaving(p, t, i) && pct(p, t, i + 1) > pct(p, t, i), `${pct(p, t, i)}% vs ${pct(p, t, i + 1)}%`)
    }
  }
}
check('every saving is positive and under 100%', plans.every((p) => terms.every((t) => [0, 1, 2].every((i) => pct(p, t, i) > 0 && pct(p, t, i) < 100))))
// The lead's worked example: $149 · $12.42/month · save 34%
check('Player Year 10+: $149 · $12.42/month · save 34%', membershipPerMonthCents(14900, 'm12') === 1242 && pct('player', 'm12', 0) === 34)
check('Player 3 mo 10+: $42 · $14/month · save 26%', membershipPerMonthCents(4200, 'm3') === 1400 && pct('player', 'm3', 0) === 26)

// --- quote(): tiering, minimum, top-ups -----------------------------------------
check('tierFor 9/10/24/25/49/50', [9, 10, 24, 25, 49, 50].map(membershipTierFor).join(',') === '10,10,10,25,25,50')

let q = membershipQuote('player', 'm6', 10, 0)
check('10 player m6 fresh → tier 10 $75', q.tier === 10 && q.unitCents === 7500 && q.totalCents === 75000, JSON.stringify(q))
check('perMonth m6 $12.50', q.perMonthCents === 1250)
check('savings vs 6 x monthly', q.retailPerPlayerCents === 11370 && q.savingsPercent === Math.round((11370 - 7500) / 11370 * 100))
q = membershipQuote('player', 'm12', 10, 0)
check('quote Player Year: retail 12 x monthly, $12.42/mo, save 34%', q.retailPerPlayerCents === 22740 && q.perMonthCents === 1242 && q.savingsPercent === 34, JSON.stringify(q))

q = membershipQuote('pro', 'm12', 25, 0)
check('25 pro year fresh → $229', q.tier === 25 && q.unitCents === 22900 && q.totalCents === 25 * 22900)
q = membershipQuote('pro', 'm12', 50, 0)
check('50 pro year fresh → $219', q.tier === 50 && q.unitCents === 21900)
q = membershipQuote('player', 'm3', 24, 0)
check('24 fresh stays tier 10', q.tier === 10 && q.unitCents === 4200)

// Top-ups: the doc's example — 22 live seats adding 5 pays the 25+ price.
q = membershipQuote('player', 'm6', 5, 22)
check('top-up 22+5 → tier 25 on the 5', q.tier === 25 && q.unitCents === 6900 && q.totalCents === 5 * 6900, JSON.stringify(q))
q = membershipQuote('pro', 'm3', 1, 49)
check('top-up 49+1 → tier 50', q.tier === 50 && q.unitCents === 6200 && q.totalCents === 6200)
q = membershipQuote('player', 'm12', 3, 10)
check('top-up 10+3 allowed, tier 10', q.tier === 10 && q.totalCents === 3 * 14900)
check('below min with 0 live throws', throws(() => membershipQuote('player', 'm6', 9, 0)))
check('below min with 9 live throws', throws(() => membershipQuote('player', 'm6', 5, 9)))
check('0 seats throws', throws(() => membershipQuote('player', 'm6', 0, 40)))
check('fractional seats throws', throws(() => membershipQuote('player', 'm6', 10.5, 0)))
check('bad plan throws', throws(() => membershipQuote('elite' as MembershipPlan, 'm6', 10, 0)))
check('bad term throws', throws(() => membershipQuote('pro', 'm9' as MembershipTerm, 10, 0)))
check('seatsError null when fine', membershipSeatsError(10, 0) === null && membershipSeatsError(1, 10) === null)
check('seatsError message', membershipSeatsError(4, 3) === 'The minimum order is 10 seats.')
check('seatsError cap', membershipSeatsError(501, 0) !== null)

// Bigger orders are never dearer per seat
for (const p of plans) for (const t of terms) {
  let prev = Infinity
  for (let n = 10; n <= 80; n++) {
    const u = membershipQuote(p, t, n, 0).unitCents
    if (u > prev) failures.push(`${p}/${t}: unit rose at ${n}`)
    prev = u
  }
  pass++
}

// --- term end ------------------------------------------------------------------
const start = new Date(Date.UTC(2026, 9, 1))
check('m3 ends Jan 1', membershipEndsAt(start, 'm3').toISOString() === '2027-01-01T00:00:00.000Z')
check('m12 ends next Oct 1', membershipEndsAt(start, 'm12').toISOString() === '2027-10-01T00:00:00.000Z')
check('Aug 31 + 6 clamps to Feb 28', membershipEndsAt(new Date(Date.UTC(2026, 7, 31)), 'm6').toISOString() === '2027-02-28T00:00:00.000Z')

console.log(`\n${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  FAIL  ${f}`)
process.exit(failures.length > 0 ? 1 : 0)
