import { humanizeReasoning } from '@/lib/sanitize'
import LearnVideo from './LearnVideo'

const CHANNEL_URL = 'https://www.youtube.com/@LearnHoopsbasketball'

interface ScoreCardProps {
  name: string
  score: number | null
  reasoning: string
  videoId?: string
}

function scoreColor(score: number) {
  if (score < 2) return 'text-red-700'
  if (score < 4) return 'text-red-600'
  if (score < 5) return 'text-red-500'
  if (score < 6) return 'text-yellow-400'
  if (score < 7) return 'text-yellow-500'
  if (score <= 7) return 'text-yellow-600'
  if (score < 9) return 'text-green-500'
  if (score < 10) return 'text-green-600'
  return 'text-green-700'
}

function barColor(score: number) {
  if (score < 2) return 'bg-red-700'
  if (score < 4) return 'bg-red-600'
  if (score < 5) return 'bg-red-500'
  if (score < 6) return 'bg-yellow-400'
  if (score < 7) return 'bg-yellow-500'
  if (score <= 7) return 'bg-yellow-600'
  if (score < 9) return 'bg-green-500'
  if (score < 10) return 'bg-green-600'
  return 'bg-green-700'
}

function scoreLabel(score: number) {
  if (score >= 9) return 'Excellent'
  if (score > 7) return 'Good'
  if (score >= 6) return 'Okay'
  if (score >= 5) return 'Below Average'
  if (score >= 3) return 'Needs Work'
  return 'Poor'
}

export default function ScoreCard({ name, score, reasoning, videoId }: ScoreCardProps) {
  const cleanReasoning = humanizeReasoning(reasoning)
  const needsHelp = score !== null && score <= 6
  const showTutorial = needsHelp && !!videoId
  const showChannelLink = needsHelp && !videoId

  if (score === null) {
    return (
      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 opacity-75">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-black font-semibold text-sm">{name}</h3>
          <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded-full">Not visible</span>
        </div>
        <p className="text-black text-xs leading-relaxed italic">{cleanReasoning}</p>
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
      <p className="text-black text-xs leading-relaxed">{cleanReasoning}</p>
      {showTutorial && <LearnVideo videoId={videoId!} label="Watch how to fix this" />}
      {showChannelLink && (
        <a
          href={CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-orange-500 hover:text-red-600 text-xs font-bold transition-colors"
        >
          Learn on the LearnHoops channel →
        </a>
      )}
    </div>
  )
}
