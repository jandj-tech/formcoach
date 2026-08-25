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
const TEAM = TEAM_TOKEN_PRICE_CENTS // 149

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
  if (q >= 15) return 57.3
  if (q >= 10) return 53.9
  if (q >= 5) return 48.7
  if (q >= 3) return 33.2
  return 0
}

/** The team ladder — unchanged from the single ladder that preceded the split. */
function expectedTeamPercent(q: number): number {
  if (q >= 100) return 25
  if (q >= 50) return 15
  if (q >= 25) return 10
  if (q >= 10) return 5
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
  // Regular: each bundle boundary undercuts the quantity below it — five
  // analyses ($8.95) cost less than four ($9.32), and the same at 10 and at
  // the 15+ floor. That is the bundle doing its job. The deeper points moved
  // when the ladder floored at $1.49, which is why this is pinned: a tier edit
  // that adds a cliff somewhere unexpected should fail here rather than ship.
  const expectedInversions = name === 'team' ? [24, 49, 99] : [4, 9, 14]
  check(
    `${name}: cheaper-than-the-step-below points are exactly {${expectedInversions.join(', ')}}`,
    JSON.stringify(inversions) === JSON.stringify(expectedInversions),
    `got {${inversions.join(', ')}}`,
  )

  // No price may land on a half cent, or it would depend on JS rounding.
  const ties = tiersFor(base).filter((t) => ((base * (100 - t.percentOff)) % 100) === 50)
  check(`${name}: no half-cent rounding ties`, ties.length === 0, ties.map((t) => t.minQty).join(','))
}

// --- team must always undercut regular -------------------------------------
// The tightest stretch is 3..9, where a regular buyer has a discount and a
// team buyer does not: 149 against 233 and 179. This is what would break first
// if the regular ladder were ever deepened much further.
let crossed: number | null = null
for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
  if (discountedUnitCents(TEAM, q) >= discountedUnitCents(REGULAR, q)) { crossed = q; break }
}
check('team rate undercuts regular at every quantity', crossed === null, crossed ? `crosses at q=${crossed}` : '')

// --- spot values, hardcoded ------------------------------------------------
const SPOTS: Array<[number, number, number]> = [
  // The advertised prices. These are the product promise; if one of these
  // moves, a page somewhere is now lying about what checkout charges.
  [REGULAR, 1, 349], [REGULAR, 2, 349], [REGULAR, 3, 233], [REGULAR, 4, 233],
  [REGULAR, 5, 179], [REGULAR, 9, 179], [REGULAR, 10, 161], [REGULAR, 14, 161],
  // From 15 the price floors at $1.49 and stays there however large the order.
  [REGULAR, 15, 149], [REGULAR, 50, 149], [REGULAR, 100, 149], [REGULAR, 1000, 149],
  [TEAM, 1, 149], [TEAM, 3, 149], [TEAM, 5, 149], [TEAM, 9, 149], [TEAM, 10, 142],
  [TEAM, 25, 134], [TEAM, 50, 127], [TEAM, 100, 112],
]
for (const [base, q, want] of SPOTS) {
  const got = discountedUnitCents(base, q)
  check(`spot: base ${base} x${q} = ${want}`, got === want, `got ${got}`)
}

// --- ladder dispatch -------------------------------------------------------
check('tiersFor(349) -> regular', tiersFor(349) === REGULAR_VOLUME_TIERS)
check('tiersFor(150) -> regular', tiersFor(150) === REGULAR_VOLUME_TIERS)
check('tiersFor(1_000_000) -> regular', tiersFor(1_000_000) === REGULAR_VOLUME_TIERS)
check('tiersFor(149) -> team', tiersFor(149) === TEAM_VOLUME_TIERS)
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
