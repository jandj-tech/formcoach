'use client'

import { copyToClipboard } from '@/lib/copy'

// "Challenge a teammate" — uses the native share sheet on phones (where most
// results are viewed) and falls back to copying the link on desktop.
export default function ShareResultButton({ score }: { score: number | null }) {
  const hasScore = score !== null && !Number.isNaN(score)

  async function handleShare() {
    const url = window.location.href
    const text = hasScore
      ? `I scored ${score!.toFixed(1)}/10 on LearnHoops AI shot analysis. Think you can beat me? 🏀`
      : 'My jump shot just got graded by AI on LearnHoops. Get yours scored too 🏀'

    if (navigator.share) {
      try {
        await navigator.share({ title: 'My LearnHoops shot score', text, url })
        return
      } catch {
        // User closed the share sheet — nothing to do.
        return
      }
    }
    copyToClipboard(`${text} ${url}`, 'Score link copied — send it to a teammate!')
  }

  return (
    <div className="text-center space-y-2">
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-2 bg-orange-500 hover:bg-red-600 text-white font-bold px-7 py-3 rounded-xl text-sm sm:text-base transition-colors"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Challenge a teammate
      </button>
      <p className="text-xs text-gray-400">Share your score — see if they can beat it.</p>
    </div>
  )
}
