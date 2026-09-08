/**
 * The one place that knows which training-ball sizes we can actually ship.
 *
 * This is a plain module — no React, no `'use client'`, no framework imports —
 * so it is safe to import from anywhere: the shop UI (`app/shop/product.ts`
 * re-exports from here), the checkout API route, the Stripe webhook, and the
 * org class-package route all read the SAME list. Restocking is a one-line
 * edit here; every gate updates at once.
 *
 * `BallSize` is defined locally rather than imported from `lib/cart.tsx`
 * (a client component) precisely so this module carries no client/server
 * boundary doubt. It is the same union as `Size` there ('5' | '6' | '7').
 */

export type BallSize = '5' | '6' | '7'

/** Inches label per size, for user-facing copy. */
export const SIZE_INCHES: Record<BallSize, string> = {
  '5': '27.5"',
  '6': '28.5"',
  '7': '29.5"',
}

/**
 * Sizes we are currently OUT OF STOCK on. Empty means everything is available.
 * Clear this list (back to `[]`) the moment the 29.5" (Size 7) ball is
 * restocked — that single edit re-opens the shop UI, the checkout guard, and
 * the schema feed together.
 */
export const OUT_OF_STOCK_SIZES: readonly BallSize[] = ['7']

export function isSizeInStock(size: BallSize): boolean {
  return !OUT_OF_STOCK_SIZES.includes(size)
}

/** The in-stock sizes, in display order — used to offer swap alternatives. */
export const IN_STOCK_SIZES: readonly BallSize[] = (['5', '6', '7'] as const).filter(isSizeInStock)

/** First size we can actually ship — what the shop selectors open on. */
export const DEFAULT_SIZE: BallSize = IN_STOCK_SIZES[0] ?? '7'

/**
 * Friendly, self-explanatory message for a blocked checkout. Both the website
 * and the iOS app surface the checkout endpoint's `{ error }` verbatim, so this
 * string is what a shopper reads when they try to buy a sold-out size.
 */
export function outOfStockMessage(size: BallSize): string {
  const inches = SIZE_INCHES[size]
  const alternatives = IN_STOCK_SIZES.map((s) => SIZE_INCHES[s])
  const altText =
    alternatives.length === 0
      ? 'Please check back soon.'
      : alternatives.length === 1
        ? `The ${alternatives[0]} is in stock and ships today.`
        : `The ${alternatives.slice(0, -1).join(', ')} and ${alternatives[alternatives.length - 1]} are in stock and ship today.`
  return `The ${inches} (Size ${size}) ball is temporarily out of stock. ${altText}`
}
