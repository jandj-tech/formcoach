/**
 * Pricing sweep — run with `npx tsx scripts/test-pricing.ts`.
 *
 * lib/team-pricing.ts has no imports, so this needs no database, no env and
 * no network. It walks every quantity a checkout route will accept, on both
 * ladders, and checks the properties that cost real money if they break.
 *
 * The expected percentages are written out longhand rather than derived from
 * tiersFor(). A test that asks the implementation what the answer should be
 * agrees with itself no matter what the table says.
 */
import {
  REGULAR_ANALYSIS_PRICE_CENTS,
  TEAM_TOKEN_PRICE_CENTS,
  REGULAR_VOLUME_TIERS,
  TEAM_VOLUME_TIERS,
  MAX_TOKENS_PER_ORDER,
  MAX_COACH_CREDITS_PER_ORDER,
  tiersFor,
  volumeDiscountPercent,
  discountedUnitCents,
  orderPricing,
} from '../lib/team-pricing'

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const REGULAR = REGULAR_ANALYSIS_PRICE_CENTS // 349
const TEAM = TEAM_TOKEN_PRICE_CENTS // 249 (small-order org rate; $1.49 at 5+)

/**
 * The regular ladder, stated independently of the module.
 *
 * Updated 2026-08 when the single price went 179¢ → 349¢ and the tiers were
 * rewritten to land on advertised bundle prices (3 for $6.99, 5 for $8.95).
 * The percentages are odd numbers because they are derived from those totals
 * rather than chosen — which is exactly why the prices, not the percentages,
 * are what this file pins.
 */
function expectedRegularPercent(q: number): number {
  if (q >= 10) return 52.7
  if (q >= 5) return 48.7
  if (q >= 3) return 33.2
  return 0
}

/** The team / org ladder: full $2.49 base under 5, the $1.49 rate at 5+. */
function expectedTeamPercent(q: number): number {
  if (q >= 5) return 40.16
  return 0
}

const LADDERS = [
  { name: 'regular', base: REGULAR, expected: expectedRegularPercent },
  { name: 'team', base: TEAM, expected: expectedTeamPercent },
]

// --- the sweep -------------------------------------------------------------
for (const { name, base, expected } of LADDERS) {
  let prevUnit = Infinity
  const inversions: number[] = []
  // Per-ladder, not the global count: reading `failures.length` meant one
  // ladder's failure marked every later ladder failed too, which sends you
  // hunting a bug in the wrong table.
  const failuresBefore = failures.length

  for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
    const { percentOff, unitCents, totalCents, fullTotalCents, savingsCents, nextTier } =
      orderPricing(base, q)

    if (percentOff !== expected(q)) {
      check(`${name} q=${q} percent`, false, `got ${percentOff}, want ${expected(q)}`)
      break
    }
    if (!Number.isInteger(unitCents) || unitCents < 1) {
      check(`${name} q=${q} whole cents`, false, `unit ${unitCents}`)
      break
    }
    if (unitCents > base || unitCents > prevUnit) {
      check(`${name} q=${q} unit never rises`, false, `${prevUnit} -> ${unitCents}`)
      break
    }
    if (totalCents !== unitCents * q || savingsCents !== fullTotalCents - totalCents || savingsCents < 0) {
      check(`${name} q=${q} totals`, false, `${totalCents} / ${savingsCents}`)
      break
    }
    // The nearest tier above must really be the nearest: nothing between.
    const tiers = tiersFor(base)
    if (nextTier) {
      if (nextTier.minQty <= q || tiers.some((t) => t.minQty > q && t.minQty < nextTier.minQty)) {
        check(`${name} q=${q} nextTier`, false, `got ${nextTier.minQty}`)
        break
      }
    } else if (tiers.some((t) => t.minQty > q)) {
      check(`${name} q=${q} nextTier null too early`, false)
      break
    }

    if (q > 1 && orderPricing(base, q - 1).totalCents > totalCents) inversions.push(q - 1)
    prevUnit = unitCents
  }

  check(
    `${name}: every quantity 1..${MAX_TOKENS_PER_ORDER} priced correctly`,
    failures.length === failuresBefore,
  )

  // Total cost can fall as quantity rises when a tier jump outruns the extra
  // unit — harmless (the buyer is never punished for buying more), but worth
  // pinning so a tier edit cannot introduce a surprise cliff unnoticed.
  // Regular: the 5-pack boundary undercuts the quantity below it — five
  // analyses ($8.95) cost less than four ($9.32). The $1.65 floor at 10 is a
  // shallow enough step down from the $1.79 five-pack that buying ten never
  // costs less than nine, so 4 is the only regular inversion. Pinned so a tier
  // edit that adds a cliff somewhere unexpected fails here rather than ships.
  // Both ladders invert only at 4: the regular 5-pack ($8.95 < 4×$2.33=$9.32)
  // and the org 5-token step ($1.49×5=$7.45 < 4×$2.49=$9.96) each make five
  // cost less than four. No deeper tiers, so no deeper inversions.
  const expectedInversions = [4]
  check(
    `${name}: cheaper-than-the-step-below points are exactly {${expectedInversions.join(', ')}}`,
    JSON.stringify(inversions) === JSON.stringify(expectedInversions),
    `got {${inversions.join(', ')}}`,
  )

  // No price may land on a half cent, or it would depend on JS rounding.
  const ties = tiersFor(base).filter((t) => ((base * (100 - t.percentOff)) % 100) === 50)
  check(`${name}: no half-cent rounding ties`, ties.length === 0, ties.map((t) => t.minQty).join(','))
}

// --- team undercuts regular, except the intended small-order org friction ---
// A 1–4 org order sits at $2.49, deliberately just above the regular 3-pack
// ($2.33), so orgs are pushed to buy 5+ for the $1.49 rate. Different buyers in
// different flows never see both prices; this is pinned so the crossover cannot
// spread beyond 3–4 unnoticed. Everywhere else team is cheaper (from 5 on it is
// $1.49 vs the regular floor of $1.65).
const crossed: number[] = []
for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
  if (discountedUnitCents(TEAM, q) >= discountedUnitCents(REGULAR, q)) crossed.push(q)
}
check(
  'team undercuts regular except the intended 3–4 org friction',
  JSON.stringify(crossed) === JSON.stringify([3, 4]),
  `crosses at {${crossed.join(', ')}}`,
)

// --- spot values, hardcoded ------------------------------------------------
const SPOTS: Array<[number, number, number]> = [
  // The advertised prices. These are the product promise; if one of these
  // moves, a page somewhere is now lying about what checkout charges.
  [REGULAR, 1, 349], [REGULAR, 2, 349], [REGULAR, 3, 233], [REGULAR, 4, 233],
  [REGULAR, 5, 179], [REGULAR, 9, 179],
  // From 10 the price floors at $1.65 and stays there however large the order.
  [REGULAR, 10, 165], [REGULAR, 14, 165], [REGULAR, 15, 165], [REGULAR, 50, 165],
  [REGULAR, 100, 165], [REGULAR, 1000, 165],
  // Team / org: $2.49 under 5, $1.49 from 5 on (the floor, never lower). Every
  // team and org gets this from day one — there is no roster minimum.
  [TEAM, 1, 249], [TEAM, 2, 249], [TEAM, 4, 249], [TEAM, 5, 149], [TEAM, 9, 149],
  [TEAM, 10, 149], [TEAM, 50, 149], [TEAM, 100, 149], [TEAM, 1000, 149],
]
for (const [base, q, want] of SPOTS) {
  const got = discountedUnitCents(base, q)
  check(`spot: base ${base} x${q} = ${want}`, got === want, `got ${got}`)
}

// --- ladder dispatch -------------------------------------------------------
check('tiersFor(349) -> regular', tiersFor(349) === REGULAR_VOLUME_TIERS)
check('tiersFor(250) -> regular', tiersFor(250) === REGULAR_VOLUME_TIERS)
check('tiersFor(1_000_000) -> regular', tiersFor(1_000_000) === REGULAR_VOLUME_TIERS)
check('tiersFor(249) -> team', tiersFor(249) === TEAM_VOLUME_TIERS)
check('tiersFor(148) -> team (cheaper rate fails safe)', tiersFor(148) === TEAM_VOLUME_TIERS)
check('tiersFor(0) -> team', tiersFor(0) === TEAM_VOLUME_TIERS)
check('tiersFor(-1) -> team', tiersFor(-1) === TEAM_VOLUME_TIERS)

// --- garbage quantities ----------------------------------------------------
for (const q of [0, -1, 0.5, 2.9, NaN]) {
  const pct = volumeDiscountPercent(REGULAR, q)
  const { unitCents, totalCents } = orderPricing(REGULAR, q)
  check(
    `garbage q=${q} -> full price, finite total`,
    pct === 0 && unitCents === REGULAR && Number.isFinite(totalCents) && totalCents >= 0,
    `pct ${pct}, unit ${unitCents}, total ${totalCents}`,
  )
}
// 2.9 must not buy the 3-token tier it hasn't paid for.
check('q=2.9 does not reach the 3-tier', volumeDiscountPercent(REGULAR, 2.9) === 0)

// --- caps still reach the deepest tier -------------------------------------
check('MAX_TOKENS_PER_ORDER reaches the top tier', MAX_TOKENS_PER_ORDER >= 100)
check('MAX_COACH_CREDITS_PER_ORDER reaches the top tier', MAX_COACH_CREDITS_PER_ORDER >= 100)

// --- report ----------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  FAIL  ${f}`)
if (failures.length === 0) {
  console.log('\n  qty   regular          team')
  for (const q of [1, 3, 5, 10, 25, 50, 100]) {
    const r = orderPricing(REGULAR, q)
    const t = orderPricing(TEAM, q)
    const fmt = (p: ReturnType<typeof orderPricing>) =>
      `${String(p.percentOff).padStart(2)}% $${(p.unitCents / 100).toFixed(2)} ea  $${(p.totalCents / 100).toFixed(2)}`
    console.log(`  ${String(q).padStart(4)}  ${fmt(r)}   ${fmt(t)}`)
  }
}
process.exit(failures.length > 0 ? 1 : 0)
