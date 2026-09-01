import type { Size, Variant } from '@/lib/cart'

/**
 * One description of the training ball, shared by everything that has to agree
 * about it: the buy box, the Product structured data, and the Merchant Center
 * feed.
 *
 * These constants used to live inside ShopProduct.tsx with a comment on
 * app/shop/page.tsx asking a human to keep the schema's price in sync by hand.
 * That is exactly the kind of duplication that drifts, and the cost of drifting
 * is not cosmetic — a feed price that disagrees with the page price gets a
 * Merchant Center account suspended, and schema that disagrees with the page
 * is a structured-data violation. One module, three consumers, no sync step.
 */

export const PRICE = 48.95
/** Ball 1 at full price + ball 2 at $35.90 = $84.85 for the pair. */
export const BUNDLE_PRICE = 84.85
/** What the bundle saves vs two singles: $97.90 − $84.85 = $13.05. */
export const BUNDLE_SAVINGS = Math.round((PRICE * 2 - BUNDLE_PRICE) * 100) / 100
/** Free shot analyses granted per single training ball. */
export const FREE_ANALYSES_PER_BALL = 5

export const CURRENCY = 'USD'
export const BASE_URL = 'https://www.learnhoops.com'

export const SIZES: { value: Size; inches: string; label: string }[] = [
  { value: '5', inches: '27.5"', label: 'Youth' },
  { value: '6', inches: '28.5"', label: "Women's" },
  { value: '7', inches: '29.5"', label: "Men's" },
]

export const VARIANTS: { value: Variant; label: string; hand: string }[] = [
  { value: 'right', label: 'Right-handed edition', hand: 'right-hand shooters' },
  { value: 'left', label: 'Left-handed edition', hand: 'left-hand shooters' },
]

export interface BallSku {
  /** Stable identifier. Never renumber these — a changed SKU reads to Google
   *  as a new product and resets whatever history the old one had. */
  sku: string
  variant: Variant
  size: Size
  inches: string
  sizeLabel: string
  title: string
  description: string
}

/** The six real SKUs: two handedness editions across three sizes. */
export const BALL_SKUS: BallSku[] = VARIANTS.flatMap(v =>
  SIZES.map(s => ({
    sku: `LH-BALL-${v.value.toUpperCase()}-${s.value}`,
    variant: v.value,
    size: s.value,
    inches: s.inches,
    sizeLabel: s.label,
    title: `LearnHoops Training Basketball — ${v.label}, Size ${s.value} (${s.inches}, ${s.label})`,
    description:
      `Basketball with printed finger-placement guides that teach correct shooting form on ` +
      `every rep. ${v.label} for ${v.hand}, size ${s.value} (${s.inches}, ${s.label} standard). ` +
      `Includes ${FREE_ANALYSES_PER_BALL} free AI shot analyses.`,
  })),
)

export const BUNDLE_SKU = 'LH-BALL-BUNDLE-2'

/** Product images, absolute — schema and the feed both need full URLs. */
export const PRODUCT_IMAGES = [`${BASE_URL}/training-ball.png`]

export const PRODUCT_NAME = 'LearnHoops Training Basketball'
export const PRODUCT_DESCRIPTION =
  'Basketball with printed finger-placement guides that teach correct shooting form on every ' +
  'rep. Left and right-handed editions in three sizes. Includes 5 free AI shot analyses.'

/**
 * `priceValidUntil` is required for Merchant Center and recommended for
 * Product rich results; an expired date suppresses the rich result silently.
 * Rolling a year forward from render beats a hardcoded date nobody remembers
 * to bump.
 */
export function priceValidUntil(from = new Date()): string {
  const d = new Date(from)
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }).format(amount)
}
