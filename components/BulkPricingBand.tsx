import {
  REGULAR_ANALYSIS_PRICE_CENTS,
  REGULAR_VOLUME_TIERS,
  discountedUnitCents,
  usd,
} from '@/lib/team-pricing'

/**
 * The bulk ladder, stated once on the homepage.
 *
 * Built from REGULAR_VOLUME_TIERS rather than written out, so the marketing
 * cannot end up advertising a discount checkout no longer gives. Quotes the
 * list rate: a signed-in team already sees its own $0.99 rate on every buy
 * surface, and this renders mostly for visitors with no session at all.
 *
 * Deliberately quiet — a row of chips under the steps, not a panel competing
 * with them. The job is to be found by someone already reading, not to shout.
 *
 * No hooks, no client bundle.
 */
export default function BulkPricingBand({ className = '' }: { className?: string }) {
  const base = REGULAR_ANALYSIS_PRICE_CENTS
  const ascending = [...REGULAR_VOLUME_TIERS].reverse()

  return (
    <div className={`rounded-xl border border-ink-950/10 bg-white/60 px-4 py-3.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ember-700">
          Bulk pricing
        </span>
        <span className="text-xs text-ink-950/55">
          the discount comes off every analysis in the order
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-lg border border-ink-950/10 px-2 py-1 text-xs text-ink-950/70">
          1 shot <span className="font-bold text-ink-950">{usd(base)}</span>
        </span>
        {ascending.map((tier) => (
          <span
            key={tier.minQty}
            className="rounded-lg border border-ink-950/10 px-2 py-1 text-xs text-ink-950/70"
          >
            {tier.minQty}+{' '}
            <span className="font-bold text-ink-950">{usd(discountedUnitCents(base, tier.minQty))}</span>{' '}
            <span className="text-green-700 font-semibold">−{tier.percentOff}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}
