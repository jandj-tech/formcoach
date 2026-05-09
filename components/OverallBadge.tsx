interface OverallBadgeProps {
  score: number
}

function grade(score: number) {
  if (score >= 9) return { letter: 'A+', label: 'Elite Form', color: 'text-green-400', ring: 'ring-green-500' }
  if (score >= 8) return { letter: 'A', label: 'Excellent Form', color: 'text-green-400', ring: 'ring-green-500' }
  if (score >= 7) return { letter: 'B+', label: 'Good Form', color: 'text-yellow-400', ring: 'ring-yellow-500' }
  if (score >= 6) return { letter: 'B', label: 'Solid Form', color: 'text-yellow-400', ring: 'ring-yellow-500' }
  if (score >= 5) return { letter: 'C', label: 'Average Form', color: 'text-orange-400', ring: 'ring-orange-500' }
  if (score >= 4) return { letter: 'D', label: 'Needs Work', color: 'text-red-400', ring: 'ring-red-500' }
  return { letter: 'F', label: 'Major Issues', color: 'text-red-500', ring: 'ring-red-600' }
}

export default function OverallBadge({ score }: OverallBadgeProps) {
  const { letter, label, color, ring } = grade(score)

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`w-36 h-36 rounded-full ring-4 ${ring} bg-slate-800 flex flex-col items-center justify-center`}
      >
        <span className={`text-5xl font-black ${color}`}>{score.toFixed(1)}</span>
        <span className="text-slate-400 text-xs">/10</span>
      </div>
      <div className="text-center">
        <div className={`text-3xl font-black ${color}`}>{letter}</div>
        <div className="text-slate-300 text-sm font-medium mt-1">{label}</div>
      </div>
    </div>
  )
}
