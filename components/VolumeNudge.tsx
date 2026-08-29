'use client'

import { orderPricing, percentLabel, usd, type OrgTier } from '@/lib/team-pricing'

/**
 * "Add 2 more and save 5%" — the offer to buy up a tier.
 *
 * It used to be a line of small grey text under the price, which is where
 * information goes to be ignored. Two changes: it looks like an offer, and it
 * IS the offer — tapping it sets the quantity, so noticing the deal and taking
 * it are the same gesture rather than a prompt to go operate a stepper.
 *
 * Renders nothing in the top tier, and nothing when the saving is zero, so it
 * can never advertise a discount the buyer cannot actually get.
 */
export default function VolumeNudge({
  tier,
  quantity,
  onJump,
  label = 'analyses',
  className = '',
}: {
  tier: OrgTier
  quantity: number
  /** Given the tier's quantity, move the order to it. */
  onJump?: (quantity: number) => void
  label?: string
  className?: string
}) {
  const { nextTier } = orderPricing(tier, quantity)
  if (!nextTier) return null

  const jumped = orderPricing(tier, nextTier.minQty)
  const more = nextTier.minQty - Math.max(0, Math.floor(quantity) || 0)
  if (jumped.savingsCents <= 0 || more <= 0) return null

  // Tiers may carry fractional percentages (tuned to land exact bundle
  // totals); the offer reads as a round number.
  const pct = percentLabel(nextTier.percentOff)

  const body = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-black text-white">
        −{pct}%
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-black leading-tight text-green-900">
          Add {more} more and save {pct}%
        </span>
        <span className="block text-xs font-semibold text-green-800/80">
          {nextTier.minQty} {label} for {usd(jumped.totalCents)} — {usd(jumped.unitCents)} each
        </span>
      </span>
    </>
  )

  const shell = `flex items-center gap-2.5 rounded-xl border-2 border-green-500 bg-green-50 px-3 py-2 ${className}`

  if (!onJump) return <div className={shell}>{body}</div>

  return (
    <button
      type="button"
      onClick={() => onJump(nextTier.minQty)}
      className={`${shell} w-full text-left transition-colors hover:bg-green-100`}
    >
      {body}
      <span className="ml-auto shrink-0 text-sm font-black text-green-700" aria-hidden>
        →
      </span>
    </button>
  )
}
