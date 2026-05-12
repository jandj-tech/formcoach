interface OverallBadgeProps {
  score: number
}

function grade(score: number) {
  if (score >= 9) return { letter: 'A+', label: 'Elite Form', color: 'text-green-700', ring: 'ring-green-700' }
  if (score >= 8) return { letter: 'A', label: 'Excellent Form', color: 'text-green-600', ring: 'ring-green-600' }
  if (score > 7) return { letter: 'B+', label: 'Good Form', color: 'text-green-500', ring: 'ring-green-500' }
  if (score >= 6) return { letter: 'B', label: 'Okay Form', color: 'text-yellow-600', ring: 'ring-yellow-500' }
  if (score >= 5) return { letter: 'C', label: 'Below Average', color: 'text-yellow-500', ring: 'ring-yellow-400' }
  if (score >= 4) return { letter: 'D', label: 'Needs Work', color: 'text-red-500', ring: 'ring-red-500' }
  if (score >= 2) return { letter: 'F', label: 'Major Issues', color: 'text-red-600', ring: 'ring-red-600' }
  return { letter: 'F', label: 'Major Issues', color: 'text-red-700', ring: 'ring-red-700' }
}

export default function OverallBadge({ score }: OverallBadgeProps) {
  const { letter, label, color, ring } = grade(score)

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`w-36 h-36 rounded-full ring-4 ${ring} bg-gray-50 flex flex-col items-center justify-center`}
      >
        <span className={`text-5xl font-black ${color}`}>{score.toFixed(1)}</span>
        <span className="text-black text-xs">/10</span>
      </div>
      <div className="text-center">
        <div className={`text-3xl font-black ${color}`}>{letter}</div>
        <div className="text-black text-sm font-medium mt-1">{label}</div>
      </div>
    </div>
  )
}
