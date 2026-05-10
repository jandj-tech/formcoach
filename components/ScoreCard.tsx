interface ScoreCardProps {
  name: string
  score: number | null
  reasoning: string
}

function scoreColor(score: number) {
  if (score >= 8) return 'text-orange-500'
  if (score >= 6) return 'text-orange-500'
  if (score >= 4) return 'text-orange-500'
  return 'text-red-500'
}

function barColor(score: number) {
  if (score >= 8) return 'bg-green-500'
  if (score >= 6) return 'bg-yellow-500'
  if (score >= 4) return 'bg-orange-500'
  return 'bg-red-500'
}

function scoreLabel(score: number) {
  if (score >= 9) return 'Excellent'
  if (score >= 7) return 'Good'
  if (score >= 5) return 'Average'
  if (score >= 3) return 'Needs Work'
  return 'Poor'
}

export default function ScoreCard({ name, score, reasoning }: ScoreCardProps) {
  if (score === null) {
    return (
      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 opacity-75">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-black font-semibold text-sm">{name}</h3>
          <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded-full">Not visible</span>
        </div>
        <p className="text-black text-xs leading-relaxed italic">{reasoning}</p>
      </div>
    )
  }

  const pct = (score / 10) * 100

  return (
    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-black font-semibold text-sm">{name}</h3>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${scoreColor(score)}`}>{scoreLabel(score)}</span>
          <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</span>
          <span className="text-black text-sm">/10</span>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
        <div
          className={`h-1.5 rounded-full transition-all duration-700 ${barColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-black text-xs leading-relaxed">{reasoning}</p>
    </div>
  )
}
