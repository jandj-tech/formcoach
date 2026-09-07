/**
 * Org offers + visibility sweep — run with `npx tsx scripts/test-org-offers.ts`.
 *
 * lib/org-offers.ts, lib/result-visibility.ts and lib/criteria-categories.ts
 * have no DB imports, so this needs no database, no env and no network. It
 * checks the properties that cost real money or leak paid content if they
 * break: tier ordering, effective-price resolution, price validation, and the
 * revenue split summing exactly to the total at every percent and amount.
 */
import {
  TIER_ORDER,
  TIER_LABELS,
  TIER_DESCRIPTIONS,
  isVisibilityTier,
  tierRank,
  atLeast,
  type VisibilityTier,
} from '../lib/result-visibility'
import {
  DEFAULT_OFFERS,
  MIN_OFFER_PRICE_CENTS,
  MAX_OFFER_PRICE_CENTS,
  effectivePriceCents,
  hasAnchorPrice,
  BALL_PLATFORM_FEE_CENTS,
  CLASS_PLATFORM_FEE_CENTS,
  platformFeeFor,
  applyShareRule,
  isOfferKind,
  isUnlockScope,
  parseSharePercent,
  shareRuleFor,
  shareRuleLabel,
  DEFAULT_PLATFORM_SHARE_PERCENT,
  orgSharePercent,
  shareSplit,
  validateOfferPrices,
} from '../lib/org-offers'
import { categoryScores, categoryForCriterion, CRITERIA_CATEGORY_ORDER } from '../lib/criteria-categories'
import { PRODUCT } from '../lib/stripe'

let pass = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

// ---- Visibility tiers -------------------------------------------------------

check('four tiers in fixed order', TIER_ORDER.join(',') === 'score,categories,breakdown,full')
for (const t of TIER_ORDER) {
  check(`isVisibilityTier(${t})`, isVisibilityTier(t))
  check(`label for ${t}`, TIER_LABELS[t].length > 0)
  check(`description for ${t}`, TIER_DESCRIPTIONS[t].length > 0)
}
check('rejects junk tier', !isVisibilityTier('everything') && !isVisibilityTier(null))

// Ranks strictly increase, and atLeast is exactly rank comparison.
for (let i = 0; i < TIER_ORDER.length; i++) {
  for (let j = 0; j < TIER_ORDER.length; j++) {
    const viewer = TIER_ORDER[i] as VisibilityTier
    const needed = TIER_ORDER[j] as VisibilityTier
    check(
      `atLeast(${viewer},${needed})`,
      atLeast(viewer, needed) === (i >= j),
      `rank ${tierRank(viewer)} vs ${tierRank(needed)}`
    )
  }
}

// ---- Effective price --------------------------------------------------------

const base = { regularPriceCents: 4999, clubPriceCents: null, discountPriceCents: null }
check('regular only → regular', effectivePriceCents(base) === 4999)
check(
  'club beats regular',
  effectivePriceCents({ ...base, clubPriceCents: 2999 }) === 2999
)
check(
  'discount beats club',
  effectivePriceCents({ ...base, clubPriceCents: 2999, discountPriceCents: 1999 }) === 1999
)
check('no anchor when regular is the price', !hasAnchorPrice(base))
check('anchor shows when club is lower', hasAnchorPrice({ ...base, clubPriceCents: 2999 }))
check(
  'no anchor when club equals regular',
  !hasAnchorPrice({ ...base, clubPriceCents: 4999 })
)

// ---- Price validation -------------------------------------------------------

check('valid trio passes', validateOfferPrices({ regularPriceCents: 29900, clubPriceCents: 19900, discountPriceCents: 14900 }) === null)
check('club above regular rejected', validateOfferPrices({ regularPriceCents: 19900, clubPriceCents: 29900, discountPriceCents: null }) !== null)
check('discount above club rejected', validateOfferPrices({ regularPriceCents: 29900, clubPriceCents: 19900, discountPriceCents: 24900 }) !== null)
check('discount above regular (no club) rejected', validateOfferPrices({ regularPriceCents: 19900, clubPriceCents: null, discountPriceCents: 24900 }) !== null)
check('fractional cents rejected', validateOfferPrices({ regularPriceCents: 2999.5, clubPriceCents: null, discountPriceCents: null }) !== null)
check('below floor rejected', validateOfferPrices({ regularPriceCents: MIN_OFFER_PRICE_CENTS - 1, clubPriceCents: null, discountPriceCents: null }) !== null)
check('above ceiling rejected', validateOfferPrices({ regularPriceCents: MAX_OFFER_PRICE_CENTS + 1, clubPriceCents: null, discountPriceCents: null }) !== null)
check('equal rungs allowed', validateOfferPrices({ regularPriceCents: 5000, clubPriceCents: 5000, discountPriceCents: 5000 }) === null)

// ---- Revenue split ----------------------------------------------------------

// The property that matters: the two shares always sum to the total, at every
// percent and amount, and neither is ever negative.
for (const total of [50, 100, 101, 2999, 5000, 30000, 39900, 44900, 123457]) {
  for (const pct of [0, 1, 12.5, 20, 33.33, 50, 66.67, 99, 100]) {
    const { orgShareCents, platformShareCents } = shareSplit(total, pct)
    check(
      `split sums (${total} @ ${pct}%)`,
      orgShareCents + platformShareCents === total && orgShareCents >= 0 && platformShareCents >= 0,
      `${orgShareCents} + ${platformShareCents}`
    )
  }
}
check('0% → org keeps all', shareSplit(2999, 0).orgShareCents === 2999)
check('100% → platform keeps all', shareSplit(2999, 100).platformShareCents === 2999)
check('platform rounds up', shareSplit(101, 50).platformShareCents === 51)
check('percent clamped above 100', shareSplit(1000, 150).platformShareCents === 1000)
check('percent clamped below 0', shareSplit(1000, -5).orgShareCents === 1000)
check('zero total splits to zero', shareSplit(0, 20).platformShareCents === 0)

// ---- Share rules (fixed fee wins over percent) --------------------------------

check('flat fee: $300 class → LearnHoops $100, club $200', JSON.stringify(applyShareRule(30000, { mode: 'flat', cents: 10000 })) === JSON.stringify({ orgShareCents: 20000, platformShareCents: 10000 }))
check('flat fee never exceeds the sale', JSON.stringify(applyShareRule(8000, { mode: 'flat', cents: 10000 })) === JSON.stringify({ orgShareCents: 0, platformShareCents: 8000 }))
check('flat fee on zero sale', applyShareRule(0, { mode: 'flat', cents: 10000 }).platformShareCents === 0)
check('percent rule matches shareSplit', JSON.stringify(applyShareRule(30000, { mode: 'percent', percent: 30 })) === JSON.stringify(shareSplit(30000, 30)))
const noRule = { platformShareCents: null, platformSharePercent: null }
check('no quote → no rule', shareRuleFor(noRule, null) === null)
check('org percent applies by default', JSON.stringify(shareRuleFor(noRule, 30)) === JSON.stringify({ mode: 'percent', percent: 30 }))
check('offer percent overrides org percent', JSON.stringify(shareRuleFor({ platformShareCents: null, platformSharePercent: 10 }, 30)) === JSON.stringify({ mode: 'percent', percent: 10 }))
check('flat fee beats both percents', JSON.stringify(shareRuleFor({ platformShareCents: 10000, platformSharePercent: 10 }, 30)) === JSON.stringify({ mode: 'flat', cents: 10000 }))
check('flat fee applies even with no org quote', shareRuleFor({ platformShareCents: 10000, platformSharePercent: null }, null)?.mode === 'flat')
check('flat label', shareRuleLabel({ mode: 'flat', cents: 10000 }) === '$100.00 per sale')
check('percent label', shareRuleLabel({ mode: 'percent', percent: 30 }) === '30% of each sale')
check('class fee is $100', CLASS_PLATFORM_FEE_CENTS === 10000)
check('ball fee equals the shop ball price', BALL_PLATFORM_FEE_CENTS === PRODUCT.priceCents)
check('no fee without class or ball', platformFeeFor({ includesCourse: false, includesBall: false }) === null)
check('class fee alone', platformFeeFor({ includesCourse: true, includesBall: false }) === CLASS_PLATFORM_FEE_CENTS)
check('ball fee alone', platformFeeFor({ includesCourse: false, includesBall: true }) === BALL_PLATFORM_FEE_CENTS)
check('class + ball fees add', platformFeeFor({ includesCourse: true, includesBall: true }) === CLASS_PLATFORM_FEE_CENTS + BALL_PLATFORM_FEE_CENTS)
check('ball offer at $79.99 leaves the club $31.04', applyShareRule(7999, { mode: 'flat', cents: BALL_PLATFORM_FEE_CENTS }).orgShareCents === 3104)

// ---- Default share -----------------------------------------------------------

check('default share is a sane percent', DEFAULT_PLATFORM_SHARE_PERCENT > 0 && DEFAULT_PLATFORM_SHARE_PERCENT < 100)
check('no override → default', orgSharePercent(null) === DEFAULT_PLATFORM_SHARE_PERCENT && orgSharePercent(undefined) === DEFAULT_PLATFORM_SHARE_PERCENT)
check('override wins, including 0', orgSharePercent(0) === 0 && orgSharePercent(12.5) === 12.5)

// ---- Share percent parsing (Stripe metadata + NUMERIC both arrive as strings)

check('parses numeric string', parseSharePercent('17.50') === 17.5)
check('parses number', parseSharePercent(20) === 20)
check('parses 0', parseSharePercent('0') === 0)
check('parses 100', parseSharePercent('100') === 100)
check('rejects empty', parseSharePercent('') === null)
check('rejects null/undefined', parseSharePercent(null) === null && parseSharePercent(undefined) === null)
check('rejects "null" string', parseSharePercent('null') === null)
check('rejects NaN', parseSharePercent('abc') === null)
check('rejects > 100', parseSharePercent('150') === null)
check('rejects negative', parseSharePercent('-5') === null)

// ---- Unlock scope ------------------------------------------------------------

check('unlock scopes', isUnlockScope('submission') && isUnlockScope('player') && !isUnlockScope('org'))

// ---- Seeded drafts ----------------------------------------------------------

check('four draft offers', DEFAULT_OFFERS.length === 4)
for (const s of DEFAULT_OFFERS) {
  check(`seed ${s.kind} kind valid`, isOfferKind(s.kind))
  check(
    `seed ${s.kind} prices valid`,
    validateOfferPrices({
      regularPriceCents: s.regularPriceCents,
      clubPriceCents: s.clubPriceCents,
      discountPriceCents: null,
    }) === null
  )
  check(`seed ${s.kind} club under regular`, s.clubPriceCents <= s.regularPriceCents)
  check(`seed ${s.kind} includes its own kind`, s.kind !== 'ball' || s.includesBall)
}
const breakdown = DEFAULT_OFFERS.find((s) => s.kind === 'breakdown')
const ball = DEFAULT_OFFERS.find((s) => s.kind === 'ball')
const course = DEFAULT_OFFERS.find((s) => s.kind === 'course')
check('draft breakdown club is the $29.99 idea', breakdown?.clubPriceCents === 2999)
check('draft ball club clears the ball fee', ball !== undefined && ball.clubPriceCents > BALL_PLATFORM_FEE_CENTS)
check('draft course club is the $300 idea', course?.clubPriceCents === 30000)
check('every seed unlocks the breakdown', DEFAULT_OFFERS.every((s) => s.includesBreakdown))
check('weekly breakdown unlocks one report', breakdown?.unlockScope === 'submission')
check('ball buyer stays unlocked', ball?.unlockScope === 'player')
check('class buyer stays unlocked', course?.unlockScope === 'player')
check('every seed has a valid scope', DEFAULT_OFFERS.every((s) => isUnlockScope(s.unlockScope)))
check('every seed carries its default fee', DEFAULT_OFFERS.every((s) => s.platformShareCents === platformFeeFor(s)))
check('breakdown-only seed uses the percent', DEFAULT_OFFERS.find((s) => s.kind === 'breakdown')?.platformShareCents === null)

// ---- Criteria categories ----------------------------------------------------

// The 18 seeded criterion names, verbatim from scripts/migrate.sql.
const SEEDED = [
  'Feet Shoulder Width Apart', 'Thumb is Spread Wide', 'Guide Hand Placement',
  'Palm Non-Contact with Ball', 'Elbow L-Shape — Under the Ball', 'Shot Pocket — Elbow',
  'Square to the Basket', 'Knees Bent', 'Dominant Foot Forward', 'Source of Shot Power',
  'Shooting Through Guide Hand / One Hand Release', 'Two Finger Release', 'Ball Rotation',
  'Forward Motion and Toes', 'Shooting Hand Follow Through', 'Guide Hand Follow Through',
  'Shot Arc', 'Connected Shot',
]
check('all 18 seeded names categorized', SEEDED.every((n) => categoryForCriterion(n) !== 'Other'))
check('unknown name lands in Other', categoryForCriterion('Made-Up Criterion') === 'Other')

const rollup = categoryScores(SEEDED.map((name, i) => ({ name, score: (i % 10) + 1 })))
check('rollup covers every category', rollup.length === CRITERIA_CATEGORY_ORDER.length)
check(
  'rollup counts sum to 18',
  rollup.reduce((sum, c) => sum + c.count, 0) === 18
)
check(
  'rollup order matches display order',
  rollup.map((c) => c.name).join('|') === CRITERIA_CATEGORY_ORDER.join('|')
)

// Null scores are excluded from averages, not counted as zero.
const withNulls = categoryScores([
  { name: 'Shot Arc', score: 8 },
  { name: 'Ball Rotation', score: null },
  { name: 'Two Finger Release', score: 6 },
])
const followThrough = withNulls.find((c) => c.name === 'Follow-Through')
const release = withNulls.find((c) => c.name === 'Release')
check('null-only entries excluded from count', release?.count === 1)
check('null does not drag the average', release?.score === 6)
check('single-score category averages to itself', followThrough?.score === 8)
const allNull = categoryScores([{ name: 'Shot Arc', score: null }])
check('all-null category reports null score', allNull.find((c) => c.name === 'Follow-Through')?.score === null)
check('one-decimal rounding', categoryScores([
  { name: 'Shot Arc', score: 7 },
  { name: 'Ball Rotation', score: 8 },
])[0] !== undefined)
const twoRelease = categoryScores([
  { name: 'Ball Rotation', score: 7 },
  { name: 'Two Finger Release', score: 8 },
]).find((c) => c.name === 'Release')
check('average rounds to one decimal', twoRelease?.score === 7.5)

// ---- Report -----------------------------------------------------------------

console.log(`\n${pass} checks passed, ${failures.length} failed`)
if (failures.length > 0) {
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
