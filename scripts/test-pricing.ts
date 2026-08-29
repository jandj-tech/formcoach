/**
 * Pricing sweep — run with `npx tsx scripts/test-pricing.ts`.
 *
 * lib/team-pricing.ts has no imports, so this needs no database, no env and
 * no network. It walks every quantity a checkout route will accept, on all
 * three ladders, and checks the properties that cost real money if they break.
 *
 * The expected percentages are written out longhand rather than derived from
 * tiersFor(). A test that asks the implementation what the answer should be
 * agrees with itself no matter what the table says.
 */
import {
  REGULAR_ANALYSIS_PRICE_CENTS,
  TEAM_TOKEN_PRICE_CENTS,
  REGULAR_VOLUME_TIERS,
  BASIC_VOLUME_TIERS,
  PLUS_VOLUME_TIERS,
  MAX_TOKENS_PER_ORDER,
  MAX_COACH_CREDITS_PER_ORDER,
  analysisBaseCents,
  isOrgTier,
  tiersFor,
  volumeDiscountPercent,
  discountedUnitCents,
  orderPricing,
  type OrgTier,
} from '../lib/team-pricing'

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * The three ladders, stated independently of the module.
 *
 * `none` is the no-plan curve, unchanged: 3 for $6.99, 5 for $8.95, floor
 * $1.65. Basic and Plus share the $2.49 base and diverge from 5 on — which is
 * exactly why the ladder can no longer be inferred from the base rate.
 */
function expectedNonePercent(q: number): number {
  if (q >= 10) return 52.7
  if (q >= 5) return 48.7
  if (q >= 3) return 33.2
  return 0
}
function expectedBasicPercent(q: number): number {
  if (q >= 10) return 40.16
  if (q >= 5) return 33.73
  return 0
}
function expectedPlusPercent(q: number): number {
  if (q >= 10) return 48.19
  if (q >= 5) return 40.16
  return 0
}

const LADDERS: Array<{
  tier: OrgTier
  expected: (q: number) => number
  /**
   * Quantities where buying one MORE token costs LESS in total, because a tier
   * jump outruns the extra unit. Harmless — the buyer is never punished for
   * buying more — but pinned per ladder so a tier edit cannot introduce a
   * surprise cliff unnoticed.
   */
  inversions: number[]
}> = [
  // none: the 5-pack ($8.95) undercuts four ($9.32). The $1.65 floor at 10 is a
  // shallow enough step down from $1.79 that ten never costs less than nine.
  { tier: 'none', expected: expectedNonePercent, inversions: [4] },
  // basic: the 5-step ($1.65×5=$8.25) undercuts four ($9.96). $1.49×10=$14.90
  // is above $1.65×9=$14.85, so no second inversion.
  { tier: 'basic', expected: expectedBasicPercent, inversions: [4] },
  // plus: same 5-step cliff, PLUS a second one at 9 — $1.29×10=$12.90 costs
  // less than $1.49×9=$13.41. The deeper the floor, the further the cliff.
  { tier: 'plus', expected: expectedPlusPercent, inversions: [4, 9] },
]

// --- the sweep -------------------------------------------------------------
for (const { tier, expected, inversions: expectedInversions } of LADDERS) {
  const base = analysisBaseCents(tier)
  let prevUnit = Infinity
  const inversions: number[] = []
  // Per-ladder, not the global count: reading `failures.length` meant one
  // ladder's failure marked every later ladder failed too, which sends you
  // hunting a bug in the wrong table.
  const failuresBefore = failures.length

  for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
    const { percentOff, unitCents, totalCents, fullTotalCents, savingsCents, nextTier, baseUnitCents } =
      orderPricing(tier, q)

    if (baseUnitCents !== base) {
      check(`${tier} q=${q} base`, false, `got ${baseUnitCents}, want ${base}`)
      break
    }
    if (percentOff !== expected(q)) {
      check(`${tier} q=${q} percent`, false, `got ${percentOff}, want ${expected(q)}`)
      break
    }
    if (!Number.isInteger(unitCents) || unitCents < 1) {
      check(`${tier} q=${q} whole cents`, false, `unit ${unitCents}`)
      break
    }
    if (unitCents > base || unitCents > prevUnit) {
      check(`${tier} q=${q} unit never rises`, false, `${prevUnit} -> ${unitCents}`)
      break
    }
    if (totalCents !== unitCents * q || savingsCents !== fullTotalCents - totalCents || savingsCents < 0) {
      check(`${tier} q=${q} totals`, false, `${totalCents} / ${savingsCents}`)
      break
    }
    // The nearest tier above must really be the nearest: nothing between.
    const tiers = tiersFor(tier)
    if (nextTier) {
      if (nextTier.minQty <= q || tiers.some((t) => t.minQty > q && t.minQty < nextTier.minQty)) {
        check(`${tier} q=${q} nextTier`, false, `got ${nextTier.minQty}`)
        break
      }
    } else if (tiers.some((t) => t.minQty > q)) {
      check(`${tier} q=${q} nextTier null too early`, false)
      break
    }

    if (q > 1 && orderPricing(tier, q - 1).totalCents > totalCents) inversions.push(q - 1)
    prevUnit = unitCents
  }

  check(
    `${tier}: every quantity 1..${MAX_TOKENS_PER_ORDER} priced correctly`,
    failures.length === failuresBefore,
  )

  check(
    `${tier}: cheaper-than-the-step-below points are exactly {${expectedInversions.join(', ')}}`,
    JSON.stringify(inversions) === JSON.stringify(expectedInversions),
    `got {${inversions.join(', ')}}`,
  )

  // No price may land on a half cent, or it would depend on JS rounding.
  const ties = tiersFor(tier).filter((t) => ((base * (100 - t.percentOff)) % 100) === 50)
  check(`${tier}: no half-cent rounding ties`, ties.length === 0, ties.map((t) => t.minQty).join(','))
}

// --- THE invariant: a plan must never cost more than no plan ----------------
// This is the failure mode the whole tier split can produce. A Basic subscriber
// paying more than someone who never subscribed is indefensible, so it is
// asserted directly rather than left to inspection.
//
// The 3–4 window is the one deliberate exception: a small order sits at the
// $2.49 base, just above the no-plan 3-pack ($2.33), which pushes buyers to the
// 5-token step where every plan wins. Pinned so it can never widen.
for (const tier of ['basic', 'plus'] as const) {
  const crossed: number[] = []
  for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
    if (discountedUnitCents(tier, q) >= discountedUnitCents('none', q)) crossed.push(q)
  }
  check(
    `${tier} undercuts no-plan except the intended 3–4 friction`,
    JSON.stringify(crossed) === JSON.stringify([3, 4]),
    `crosses at {${crossed.join(', ')}}`,
  )
}

// Plus is never dearer than Basic, at any quantity. Equal below 5 (same base),
// strictly cheaper from 5 on.
const plusDearer: number[] = []
for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
  if (discountedUnitCents('plus', q) > discountedUnitCents('basic', q)) plusDearer.push(q)
}
check('plus is never dearer than basic', plusDearer.length === 0, `dearer at {${plusDearer.join(', ')}}`)

// --- spot values, hardcoded ------------------------------------------------
const SPOTS: Array<[OrgTier, number, number]> = [
  // The advertised prices. These are the product promise; if one of these
  // moves, a page somewhere is now lying about what checkout charges.
  ['none', 1, 349], ['none', 2, 349], ['none', 3, 233], ['none', 4, 233],
  ['none', 5, 179], ['none', 9, 179],
  ['none', 10, 165], ['none', 14, 165], ['none', 50, 165], ['none', 1000, 165],
  // Basic: $2.49 under 5, $1.65 at 5–9, $1.49 from 10 on.
  ['basic', 1, 249], ['basic', 4, 249], ['basic', 5, 165], ['basic', 9, 165],
  ['basic', 10, 149], ['basic', 50, 149], ['basic', 1000, 149],
  // Plus: $2.49 under 5, $1.49 at 5–9, $1.29 from 10 on — the floor anywhere.
  ['plus', 1, 249], ['plus', 4, 249], ['plus', 5, 149], ['plus', 9, 149],
  ['plus', 10, 129], ['plus', 50, 129], ['plus', 1000, 129],
]
for (const [tier, q, want] of SPOTS) {
  const got = discountedUnitCents(tier, q)
  check(`spot: ${tier} x${q} = ${want}`, got === want, `got ${got}`)
}

// --- base rates and ladder dispatch ----------------------------------------
check('base none = 349', analysisBaseCents('none') === REGULAR_ANALYSIS_PRICE_CENTS)
check('base basic = 249', analysisBaseCents('basic') === TEAM_TOKEN_PRICE_CENTS)
check('base plus = 249', analysisBaseCents('plus') === TEAM_TOKEN_PRICE_CENTS)
check('tiersFor(none) -> regular', tiersFor('none') === REGULAR_VOLUME_TIERS)
check('tiersFor(basic) -> basic', tiersFor('basic') === BASIC_VOLUME_TIERS)
check('tiersFor(plus) -> plus', tiersFor('plus') === PLUS_VOLUME_TIERS)

// isOrgTier guards every wire and database read, so junk must not slip through
// as a paid tier.
for (const good of ['none', 'basic', 'plus']) check(`isOrgTier('${good}')`, isOrgTier(good))
for (const bad of ['PLUS', 'premium', '', null, undefined, 0, {}]) {
  check(`isOrgTier(${JSON.stringify(bad)}) is false`, !isOrgTier(bad))
}

// --- garbage quantities ----------------------------------------------------
for (const q of [0, -1, 0.5, 2.9, NaN]) {
  const pct = volumeDiscountPercent('none', q)
  const { unitCents, totalCents } = orderPricing('none', q)
  check(
    `garbage q=${q} -> full price, finite total`,
    pct === 0 && unitCents === REGULAR_ANALYSIS_PRICE_CENTS && Number.isFinite(totalCents) && totalCents >= 0,
    `pct ${pct}, unit ${unitCents}, total ${totalCents}`,
  )
}
// 2.9 must not buy the 3-token tier it hasn't paid for.
check('q=2.9 does not reach the 3-tier', volumeDiscountPercent('none', 2.9) === 0)

// --- caps still reach the deepest tier -------------------------------------
check('MAX_TOKENS_PER_ORDER reaches the top tier', MAX_TOKENS_PER_ORDER >= 10)
check('MAX_COACH_CREDITS_PER_ORDER reaches the top tier', MAX_COACH_CREDITS_PER_ORDER >= 10)

// --- report ----------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  FAIL  ${f}`)
if (failures.length === 0) {
  console.log('\n  qty   no plan            basic              plus')
  for (const q of [1, 3, 5, 10, 25, 50, 100]) {
    const fmt = (t: OrgTier) => {
      const p = orderPricing(t, q)
      return `${String(Math.round(p.percentOff)).padStart(2)}% $${(p.unitCents / 100).toFixed(2)} ea $${(p.totalCents / 100).toFixed(2)}`.padEnd(18)
    }
    console.log(`  ${String(q).padStart(4)}  ${fmt('none')} ${fmt('basic')} ${fmt('plus')}`)
  }
}
process.exit(failures.length > 0 ? 1 : 0)
