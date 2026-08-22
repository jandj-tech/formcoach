'use client'

import VideoUploader from './VideoUploader'
import BuySelfCreditsButton from './BuySelfCreditsButton'
import { useIsInApp } from '@/lib/useIsInApp'
import { analysisUnitCents, usd } from '@/lib/team-pricing'

// The analyze-page uploader for coaches and org owners. The upload zone is
// always shown — with a transparent "0 credits" overlay when empty — and the
// credit-purchase panel sits below it.
export default function CoachSelfUploader({
  credits,
  initiated,
}: {
  credits: number
  initiated: boolean
}) {
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
              {initiated ? `${usd(analysisUnitCents(true))} per analysis.` : `${usd(analysisUnitCents(false))} per analysis until your team has 8+ players and has bought 8 tokens.`}
            </p>
          </div>
          <BuySelfCreditsButton initiated={initiated} />
        </div>
      )}
    </div>
  )
}
