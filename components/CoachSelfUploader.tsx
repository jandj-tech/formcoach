'use client'

import VideoUploader from './VideoUploader'
import BuySelfCreditsButton from './BuySelfCreditsButton'
import { useIsInApp } from '@/lib/useIsInApp'
import { discountedUnitCents, usd, TEAM_FULL_RATE_MIN_QTY, type OrgTier } from '@/lib/team-pricing'

// The analyze-page uploader for coaches and org owners. The upload zone is
// always shown — with a transparent "0 credits" overlay when empty — and the
// credit-purchase panel sits below it.
export default function CoachSelfUploader({ credits, tier }: { credits: number; tier: OrgTier }) {
  const inApp = useIsInApp()
  return (
    <div className="w-full max-w-lg mx-auto space-y-4 px-2">
      <VideoUploader coachSelf coachCredits={credits} />

      {/* Analysis credit purchase — hidden in the iOS app (guideline 3.1.1) */}
      {!inApp && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-black">
              {credits} analysis credit{credits !== 1 ? 's' : ''} remaining
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {`${usd(discountedUnitCents(tier, 1))} per analysis, ${usd(discountedUnitCents(tier, TEAM_FULL_RATE_MIN_QTY))} when you buy ${TEAM_FULL_RATE_MIN_QTY} or more.`}
            </p>
          </div>
          <BuySelfCreditsButton tier={tier} />
        </div>
      )}
    </div>
  )
}
