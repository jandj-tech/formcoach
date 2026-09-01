/**
 * Pricing sweep — run with `npx tsx scripts/test-pricing.ts`.
 *
 * lib/team-pricing.ts has no imports, so this needs no database, no env and
 * no network. It walks every quantity a checkout route will accept, on both
 * ladders, and checks the properties that cost real money if they break.
 *
 * The expected prices are written out longhand rather than derived from
 * tiersFor(). A test that asks the implementation what the answer should be
 * agrees with itself no matter what the table says.
 */
import {
  REGULAR_ANALYSIS_PRICE_CENTS,
  REGULAR_VOLUME_PRICE_CENTS,
  REGULAR_VOLUME_MIN_QTY,
  ORG_BULK_PRICE_CENTS,
  ORG_BULK_MIN_QTY,
  TEAM_TOKEN_PRICE_CENTS,
  REGULAR_VOLUME_TIERS,
  ORG_VOLUME_TIERS,
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
import {
  annualPercentOff,
  annualSavingsCents,
  launchOfferMonthlyCents,
  LAUNCH_OFFER_PERCENT_OFF,
  ORG_TIERS,
  type PaidTier,
} from '../lib/org-subscription-pricing'

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * The two ladders, stated independently of the module.
 *
 * Public: $9.99 each for 1–4, $5.00 each from 5 on (the WHOLE order — five
 * tokens is $25.00 flat, never 4×$9.99 + $5).
 * Org (basic/plus, identical): public pricing below 10, $2.49 each from 10 on.
 * The bulk rate has a HARD minimum of 10 — an org buying 9 pays the public $5.
 */
function expectedNoneUnit(q: number): number {
  return q >= 5 ? 500 : 999
}
function expectedOrgUnit(q: number): number {
  if (q >= 10) return 249
  if (q >= 5) return 500
  return 999
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
  // none: the 5-step ($25.00) undercuts four ($39.96). One cliff.
  { tier: 'none', expected: expectedNoneUnit, inversions: [4] },
  // org: the same 5-step cliff, plus a second at 9 — 10×$2.49=$24.90 costs
  // less than 9×$5.00=$45.00.
  { tier: 'basic', expected: expectedOrgUnit, inversions: [4, 9] },
  { tier: 'plus', expected: expectedOrgUnit, inversions: [4, 9] },
]

// --- the sweep -------------------------------------------------------------
for (const { tier, expected, inversions: expectedInversions } of LADDERS) {
  const base = analysisBaseCents(tier)
  let prevUnit = Infinity
  const inversions: number[] = []
  const failuresBefore = failures.length

  for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
    const { percentOff, unitCents, totalCents, fullTotalCents, savingsCents, nextTier, baseUnitCents } =
      orderPricing(tier, q)

    if (baseUnitCents !== base) {
      check(`${tier} q=${q} base`, false, `got ${baseUnitCents}, want ${base}`)
      break
    }
    if (unitCents !== expected(q)) {
      check(`${tier} q=${q} unit`, false, `got ${unitCents}, want ${expected(q)}`)
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
    // percentOff must be exactly consistent with the cents it advertises.
    const expectPct = ((base - unitCents) / base) * 100
    if (Math.abs(percentOff - expectPct) > 1e-9) {
      check(`${tier} q=${q} percent matches cents`, false, `got ${percentOff}`)
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
}

// --- THE invariant: a plan must never cost more than no plan ----------------
// Under the 2026-09 model the org ladder IS the public ladder below the bulk
// minimum, so an org member is never dearer anywhere — asserted strictly.
for (const tier of ['basic', 'plus'] as const) {
  const dearer: number[] = []
  for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
    if (discountedUnitCents(tier, q) > discountedUnitCents('none', q)) dearer.push(q)
  }
  check(`${tier} is never dearer than no-plan`, dearer.length === 0, `dearer at {${dearer.join(', ')}}`)
}

// Basic and Plus price identically at every quantity (one org bulk rate).
const diverge: number[] = []
for (let q = 1; q <= MAX_TOKENS_PER_ORDER; q++) {
  if (discountedUnitCents('plus', q) !== discountedUnitCents('basic', q)) diverge.push(q)
}
check('basic and plus share one ladder', diverge.length === 0, `diverge at {${diverge.join(', ')}}`)

// --- spot values, hardcoded (the product promise) ----------------------------
const SPOTS: Array<[OrgTier, number, number]> = [
  // Public: 1–4 at $9.99, 5+ at $5.00.
  ['none', 1, 999], ['none', 2, 999], ['none', 3, 999], ['none', 4, 999],
  ['none', 5, 500], ['none', 9, 500],
  ['none', 10, 500], ['none', 50, 500], ['none', 1000, 500],
  // Org: public below the bulk minimum — 9 tokens does NOT earn $2.49.
  ['basic', 1, 999], ['basic', 4, 999], ['basic', 5, 500], ['basic', 9, 500],
  ['basic', 10, 249], ['basic', 20, 249], ['basic', 50, 249], ['basic', 1000, 249],
  ['plus', 1, 999], ['plus', 4, 999], ['plus', 5, 500], ['plus', 9, 500],
  ['plus', 10, 249], ['plus', 50, 249], ['plus', 1000, 249],
]
for (const [tier, q, want] of SPOTS) {
  const got = discountedUnitCents(tier, q)
  check(`spot: ${tier} x${q} = ${want}`, got === want, `got ${got}`)
}

// Order totals exactly as advertised (PART 5 / PART 8 of the pricing spec).
const TOTALS: Array<[OrgTier, number, number]> = [
  ['none', 1, 999],    // $9.99
  ['none', 2, 1998],   // $19.98
  ['none', 4, 3996],   // $39.96
  ['none', 5, 2500],   // $25.00
  ['none', 10, 5000],  // $50.00
  ['basic', 10, 2490], // $24.90
  ['basic', 20, 4980], // $49.80
  ['basic', 50, 12450], // $124.50
]
for (const [tier, q, want] of TOTALS) {
  const got = orderPricing(tier, q).totalCents
  check(`total: ${tier} x${q} = ${want}`, got === want, `got ${got}`)
}

// --- base rates, constants, ladder dispatch ----------------------------------
check('base rate is $9.99 for everyone', analysisBaseCents('none') === 999 && analysisBaseCents('basic') === 999 && analysisBaseCents('plus') === 999)
check('REGULAR_ANALYSIS_PRICE_CENTS = 999', REGULAR_ANALYSIS_PRICE_CENTS === 999)
check('REGULAR_VOLUME_PRICE_CENTS = 500 at 5+', REGULAR_VOLUME_PRICE_CENTS === 500 && REGULAR_VOLUME_MIN_QTY === 5)
check('ORG_BULK_PRICE_CENTS = 249, min 10', ORG_BULK_PRICE_CENTS === 249 && ORG_BULK_MIN_QTY === 10)
check('legacy TEAM_TOKEN_PRICE_CENTS alias = org bulk', TEAM_TOKEN_PRICE_CENTS === 249)
check('tiersFor(none) -> regular', tiersFor('none') === REGULAR_VOLUME_TIERS)
check('tiersFor(basic) -> org', tiersFor('basic') === ORG_VOLUME_TIERS)
check('tiersFor(plus) -> org', tiersFor('plus') === ORG_VOLUME_TIERS)
check('basic/plus tier aliases point at the org ladder', BASIC_VOLUME_TIERS === ORG_VOLUME_TIERS && PLUS_VOLUME_TIERS === ORG_VOLUME_TIERS)

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
// 4.9 must not buy the 5-token tier it hasn't paid for; 9.9 not the bulk tier.
check('q=4.9 does not reach the 5-tier', discountedUnitCents('none', 4.9) === 999)
check('q=9.9 does not reach the org bulk tier', discountedUnitCents('basic', 9.9) === 500)

// --- org membership prices (the ~32.5% increase) ------------------------------
// Pinned against the PRE-increase prices so the intent is in the test: each
// price point must land 29–36% above what it replaced.
const OLD_ORG_PRICES: Record<PaidTier, { monthly: number; annual: number }> = {
  basic: { monthly: 999, annual: 9588 },
  plus: { monthly: 1999, annual: 17988 },
}
check('org basic monthly = $12.99', ORG_TIERS.basic.monthlyCents === 1299)
check('org basic annual = $125.88 ($10.49/mo)', ORG_TIERS.basic.annualTotalCents === 12588 && ORG_TIERS.basic.annualMonthlyCents === 1049)
check('org plus monthly = $26.49', ORG_TIERS.plus.monthlyCents === 2649)
check('org plus annual = $239.88 ($19.99/mo)', ORG_TIERS.plus.annualTotalCents === 23988 && ORG_TIERS.plus.annualMonthlyCents === 1999)
for (const tier of ['basic', 'plus'] as const) {
  const mUp = ORG_TIERS[tier].monthlyCents / OLD_ORG_PRICES[tier].monthly
  const aUp = ORG_TIERS[tier].annualTotalCents / OLD_ORG_PRICES[tier].annual
  check(`${tier} monthly increase within 29–36%`, mUp >= 1.29 && mUp <= 1.36, `${((mUp - 1) * 100).toFixed(1)}%`)
  check(`${tier} annual increase within 29–36%`, aUp >= 1.29 && aUp <= 1.36, `${((aUp - 1) * 100).toFixed(1)}%`)
  // The advertised per-month figure must be exactly annualTotal/12 (whole cents).
  check(`${tier} annual per-month is exact`, ORG_TIERS[tier].annualMonthlyCents * 12 === ORG_TIERS[tier].annualTotalCents)
  // Annual must still be a real saving.
  check(`${tier} annual saves money`, annualSavingsCents(tier) > 0 && annualPercentOff(tier) >= 15)
}

// --- launch offer lands on exact cents -------------------------------------
for (const [tier, want] of [['basic', 949], ['plus', 1949]] as Array<[PaidTier, number]>) {
  const got = launchOfferMonthlyCents(tier)
  check(`launch offer: ${tier} first-3-months price is ${want}`, got === want, `got ${got}`)
  check(
    `launch offer: ${tier} price and discount are both whole cents`,
    Number.isInteger(got) && Number.isInteger(ORG_TIERS[tier].monthlyCents - got),
  )
  // Never advertise a bigger discount than is actually given. Landing slightly
  // OVER the advertised percentage is fine; landing under is a false claim.
  const actualPercent = ((ORG_TIERS[tier].monthlyCents - got) / ORG_TIERS[tier].monthlyCents) * 100
  check(
    `launch offer: ${tier} gives at least the advertised ${LAUNCH_OFFER_PERCENT_OFF}%`,
    actualPercent >= LAUNCH_OFFER_PERCENT_OFF,
    `actual ${actualPercent.toFixed(2)}%`,
  )
}

// --- caps still reach the deepest tier -------------------------------------
check('MAX_TOKENS_PER_ORDER reaches the bulk tier', MAX_TOKENS_PER_ORDER >= ORG_BULK_MIN_QTY)
check('MAX_COACH_CREDITS_PER_ORDER reaches the bulk tier', MAX_COACH_CREDITS_PER_ORDER >= ORG_BULK_MIN_QTY)

// --- report ----------------------------------------------------------------
console.log(`\n${pass} passed, ${failures.length} failed`)
for (const f of failures) console.log(`  FAIL  ${f}`)
if (failures.length === 0) {
  console.log('\n  qty   no plan            basic              plus')
  for (const q of [1, 3, 5, 9, 10, 25, 50, 100]) {
    const fmt = (t: OrgTier) => {
      const p = orderPricing(t, q)
      return `${String(Math.round(p.percentOff)).padStart(2)}% $${(p.unitCents / 100).toFixed(2)} ea $${(p.totalCents / 100).toFixed(2)}`.padEnd(18)
    }
    console.log(`  ${String(q).padStart(4)}  ${fmt('none')} ${fmt('basic')} ${fmt('plus')}`)
  }
}
process.exit(failures.length > 0 ? 1 : 0)
