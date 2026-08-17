import Link from 'next/link'
import {
  REGULAR_ANALYSIS_PRICE_CENTS,
  REGULAR_VOLUME_TIERS,
  discountedUnitCents,
  usd,
} from '@/lib/team-pricing'

/**
 * The bulk ladder, stated plainly on the marketing pages.
 *
 * Built from REGULAR_VOLUME_TIERS rather than written out, so the homepage
 * cannot end up advertising a discount the checkout no longer gives. Quotes
 * the list rate on purpose — a signed-in team already sees its own $0.99 rate
 * on every buy surface, and this renders for visitors who mostly have no
 * session at all.
 *
 * No hooks, no client bundle.
 */
export default function BulkPricingBand({ className = '' }: { className?: string }) {
  const base = REGULAR_ANALYSIS_PRICE_CENTS
  const ascending = [...REGULAR_VOLUME_TIERS].reverse()
  const best = ascending[ascending.length - 1]
  const bestUnit = discountedUnitCents(base, best.minQty)

  return (
    <div
      className={`rounded-2xl border-2 border-ember-500 bg-white p-6 sm:p-8 shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow text-ember-700 mb-2 select-none">Bulk pricing</p>
          <h3 className="font-display font-black uppercase text-[clamp(1.4rem,3vw,2.1rem)] leading-[0.95]">
            Buy more,
            <br />
            pay less per shot
          </h3>
        </div>
        <p className="text-ink-950/70 text-sm leading-relaxed max-w-xs">
          The discount comes off <strong className="text-ink-950">every analysis in the order</strong>,
          not just the extra ones — and they never expire, so they wait for your next session.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        <div className="rounded-xl border border-ink-950/10 bg-ink-950/[0.03] px-3 py-3 text-center">
          <div className="font-numeric text-xs text-ink-950/50 mb-1">1 shot</div>
          <div className="font-display font-black text-lg leading-none">{usd(base)}</div>
          <div className="text-[11px] text-ink-950/40 mt-1">each</div>
        </div>
        {ascending.map((tier) => (
          <div
            key={tier.minQty}
            className={`rounded-xl px-3 py-3 text-center border ${
              tier.minQty === best.minQty
                ? 'border-ember-500 bg-ember-500/10'
                : 'border-ink-950/10 bg-ink-950/[0.03]'
            }`}
          >
            <div className="font-numeric text-xs text-ink-950/50 mb-1">{tier.minQty}+ shots</div>
            <div className="font-display font-black text-lg leading-none text-ember-700">
              {usd(discountedUnitCents(base, tier.minQty))}
            </div>
            <div className="text-[11px] font-bold text-green-700 mt-1">save {tier.percentOff}%</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/analyze"
          className="bg-ember-500 hover:bg-ember-400 text-ink-950 font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
        >
          Start with a free analysis →
        </Link>
        <p className="text-ink-950/60 text-sm">
          As low as <strong className="text-ink-950">{usd(bestUnit)}</strong> a shot. Coaches and
          teams pay less again —{' '}
          <Link href="/team" className="underline hover:text-ink-950">
            see team pricing
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
