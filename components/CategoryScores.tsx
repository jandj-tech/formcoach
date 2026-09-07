import type { CategoryScore } from '@/lib/criteria-categories'

// Category rollup for the "Score + category scores" visibility tier. The
// color/bar treatment mirrors ScoreCard so a category average reads on the
// same scale as an individual criterion.

function scoreColor(score: number) {
  if (score < 4) return 'text-red-600'
  if (score < 6) return 'text-yellow-500'
  if (score <= 7) return 'text-yellow-600'
  if (score < 9) return 'text-green-500'
  return 'text-green-600'
}

function barColor(score: number) {
  if (score < 4) return 'bg-red-600'
  if (score < 6) return 'bg-yellow-500'
  if (score <= 7) return 'bg-yellow-600'
  if (score < 9) return 'bg-green-500'
  return 'bg-green-600'
}

export default function CategoryScores({ categories }: { categories: CategoryScore[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {categories.map((c) => (
        <div key={c.name} className="bg-gray-50 rounded-xl p-5 border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-black font-semibold text-sm">{c.name}</h3>
            {c.score !== null ? (
              <div className="flex items-baseline gap-1 tabular-nums">
                <span className={`text-2xl font-bold ${scoreColor(c.score)}`}>
                  {c.score.toFixed(1)}
                </span>
                <span className="text-black text-sm">/10</span>
              </div>
            ) : (
              <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded-full">
                Not graded
              </span>
            )}
          </div>
          {c.score !== null && (
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${barColor(c.score)}`}
                style={{ width: `${(c.score / 10) * 100}%` }}
              />
            </div>
          )}
          <p className="text-gray-500 text-[11px] mt-2">
            {c.count} {c.count === 1 ? 'check' : 'checks'} graded in this area
          </p>
        </div>
      ))}
    </div>
  )
}
