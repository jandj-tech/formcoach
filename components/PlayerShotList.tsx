import Link from 'next/link'

export interface Shot {
  id: string
  token: string
  created_at: string
  // Postgres returns DECIMAL columns as strings, so this can be either.
  overall_score: string | number | null
}

function scoreColor(score: number) {
  if (score >= 8) return 'text-green-600'
  if (score >= 6) return 'text-orange-500'
  return 'text-red-500'
}

// Coach/org-facing list of a player's analyzed shots; each row opens the breakdown.
export default function PlayerShotList({ shots }: { shots: Shot[] }) {
  if (shots.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
        <p className="font-semibold">No shots analyzed yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {shots.map((shot) => {
        const score = shot.overall_score == null ? null : Number(shot.overall_score)
        const date = new Date(shot.created_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
        return (
          <Link
            key={shot.id}
            href={`/results/${shot.token}`}
            className="flex items-center gap-4 bg-gray-50 hover:bg-orange-50 border border-gray-200 hover:border-orange-200 rounded-xl p-4 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500">{date}</p>
              <p className="text-black font-semibold text-sm mt-0.5 group-hover:text-orange-600 transition-colors">
                View Shot Breakdown →
              </p>
            </div>
            {score !== null && !Number.isNaN(score) ? (
              <div className={`text-2xl font-black shrink-0 ${scoreColor(score)}`}>
                {score.toFixed(1)}
              </div>
            ) : (
              <div className="text-gray-300 text-sm shrink-0">—</div>
            )}
          </Link>
        )
      })}
    </div>
  )
}
