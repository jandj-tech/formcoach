import { REGULAR_VOLUME_TIERS } from '@/lib/team-pricing'

/**
 * One line about bulk pricing on the homepage.
 *
 * Earlier versions listed the whole ladder — a price chip per tier — which
 * was a lot of furniture for a point that fits in a sentence. Someone
 * deciding whether to try this at all needs to know a discount exists; the
 * exact per-analysis figures are on the buy screens, where they can act on
 * them.
 *
 * The headline percentage is the deepest tier in REGULAR_VOLUME_TIERS rather
 * than a typed number, so it cannot outlive a change to the ladder.
 *
 * No hooks, no client bundle.
 */
export default function BulkPricingBand({ className = '' }: { className?: string }) {
  const best = REGULAR_VOLUME_TIERS.reduce(
    (top, tier) => (tier.percentOff > top.percentOff ? tier : top),
    REGULAR_VOLUME_TIERS[0],
  )

  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-ink-950/10 bg-white/60 px-5 py-4 ${className}`}
    >
      <span className="font-display font-black uppercase leading-none text-ember-600 text-[clamp(1.9rem,5vw,2.75rem)]">
        Up to {best.percentOff}% off
      </span>
      <span className="text-sm text-ink-950/60">
        when you buy more than one — the discount comes off every analysis in the order, and they
        never expire.
      </span>
    </div>
  )
}
