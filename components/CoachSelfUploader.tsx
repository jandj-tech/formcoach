'use client'

import VideoUploader from './VideoUploader'
import BuySelfCreditsButton from './BuySelfCreditsButton'

// The analyze-page uploader for coaches and org owners — uses their own
// analysis credits ($2.50 once their team is initiated, $5.00 before).
export default function CoachSelfUploader({
  credits,
  initiated,
}: {
  credits: number
  initiated: boolean
}) {
  return (
    <div className="w-full max-w-lg mx-auto space-y-4 px-2">
      <div className="flex items-center justify-between gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-black">
            {credits} analysis credit{credits !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {initiated ? '$2.50 per analysis.' : '$5.00 per analysis until your team is initiated.'}
          </p>
        </div>
        <BuySelfCreditsButton initiated={initiated} />
      </div>

      {credits > 0 ? (
        <VideoUploader coachSelf />
      ) : (
        <p className="text-center text-sm text-gray-400">
          Buy a credit above, then upload your shot to analyze it.
        </p>
      )}
    </div>
  )
}
