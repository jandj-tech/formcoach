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
// `showNotesLink` is opt-in because this component is also rendered on the org
// member page, where the viewer holds an org session and not a team session —
// the coach notes page would just bounce them to /login.
export default function PlayerShotList({
  shots,
  showNotesLink = false,
}: {
  shots: Shot[]
  showNotesLink?: boolean
}) {
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
          <div
            key={shot.id}
            className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2"
          >
            <Link
              href={`/results/${shot.token}`}
              className="flex items-center gap-4 group"
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
            {showNotesLink && (
              <Link
                href={`/team/dashboard/shot/${shot.token}`}
                className="inline-block text-xs font-bold text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                ✎ Add coaching notes
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}
