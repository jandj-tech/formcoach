'use client'

import { tiersFor, orderPricing, usd, TEAM_TOKEN_PRICE_CENTS } from '@/lib/team-pricing'
import VolumeNudge from '@/components/VolumeNudge'

/**
 * Order summary that makes the volume discount visible: the per-token price
 * with the undiscounted rate struck through, the amount saved, and how many
 * more tokens would reach the next tier.
 */
export default function VolumeSavings({
  baseUnitCents,
  quantity,
  label = 'token',
  onJump,
}: {
  baseUnitCents: number
  quantity: number
  label?: string
  /** Lets the tier nudge move the order up to the tier it is offering. */
  onJump?: (quantity: number) => void
}) {
  const { percentOff, unitCents, totalCents, fullTotalCents, savingsCents } = orderPricing(
    baseUnitCents,
    quantity,
  )

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {quantity} {quantity === 1 ? label : `${label}s`} × {usd(unitCents)}
          {percentOff > 0 && (
            <span className="ml-1.5 text-xs text-gray-400 line-through">{usd(baseUnitCents)}</span>
          )}
        </p>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-black leading-none">{usd(totalCents)}</p>
          {percentOff > 0 && (
            <p className="text-xs text-gray-400 line-through mt-0.5">{usd(fullTotalCents)}</p>
          )}
        </div>
      </div>

      {percentOff > 0 && (
        <p className="text-sm font-bold text-green-700">
          {percentOff}% bulk discount applied — you save {usd(savingsCents)}
        </p>
      )}

      <VolumeNudge
        baseUnitCents={baseUnitCents}
        quantity={quantity}
        onJump={onJump}
        label={`${label}s`}
      />
    </div>
  )
}

/**
 * Compact list of every tier — so buyers can see the discounts before choosing.
 *
 * `baseUnitCents` is required rather than defaulted: there are two ladders now,
 * and a default would quietly show a team buyer the regular one — advertising
 * a discount they cannot get, on a screen they are about to pay from.
 */
export function VolumeTierList({
  baseUnitCents,
  className = '',
}: {
  baseUnitCents: number
  className?: string
}) {
  const ascending = [...tiersFor(baseUnitCents)].reverse()
  const onTeamRate = baseUnitCents <= TEAM_TOKEN_PRICE_CENTS
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-[11px] text-gray-500">
        {onTeamRate ? `Bulk pricing on your ${usd(baseUnitCents)} rate:` : 'Bulk pricing:'}
      </span>
      {ascending.map((t) => (
        <span
          key={t.minQty}
          className="text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5"
        >
          {t.minQty}+ save {t.percentOff}%
        </span>
      ))}
    </div>
  )
}
