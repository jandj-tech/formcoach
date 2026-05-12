import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import OverallBadge from '@/components/OverallBadge'
import ScoreCard from '@/components/ScoreCard'

export default async function ResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const [submission] = await db`
    SELECT id, status FROM submissions WHERE token = ${token}
  `

  if (!submission) return notFound()

  const [analysis] = await db`
    SELECT a.*
    FROM analyses a
    WHERE a.submission_id = ${submission.id}
    ORDER BY a.created_at DESC
    LIMIT 1
  `

  if (!analysis) return notFound()

  const scores = await db`
    SELECT cs.id, cs.ai_score, cs.ai_reasoning, c.name, c.order_index
    FROM criterion_scores cs
    JOIN criteria c ON cs.criterion_id = c.id
    WHERE cs.analysis_id = ${analysis.id}
    ORDER BY c.order_index
  `

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto w-full px-6 py-10 space-y-8">
        <div className="flex justify-center">
          <OverallBadge score={Number(analysis.overall_score)} />
        </div>

        {analysis.video_url && (
          <div className="space-y-2">
            <h2 className="text-black font-bold text-sm">Your Shot</h2>
            <video
              src={analysis.video_url as string}
              controls
              playsInline
              className="w-full rounded-xl bg-black border border-gray-200"
            />
          </div>
        )}

        <div className="space-y-3">
          {scores.map((s) => (
            <ScoreCard
              key={s.id}
              name={s.name}
              score={s.ai_score !== null ? Number(s.ai_score) : null}
              reasoning={s.ai_reasoning}
            />
          ))}
        </div>

        {analysis.frame_urls && (analysis.frame_urls as string[]).length > 0 && (
          <div className="space-y-2">
            <h2 className="text-black font-bold text-sm">Analyzed Frames</h2>
            <p className="text-zinc-500 text-xs">Swipe or scroll to see each frame analyzed by the AI.</p>
            <div className="-mx-6 overflow-x-auto snap-x snap-mandatory">
              <div className="flex gap-3 px-6 pb-2">
                {(analysis.frame_urls as string[]).map((url, i) => (
                  <div
                    key={i}
                    className="snap-start flex-shrink-0 w-64 sm:w-72 relative"
                  >
                    <img
                      src={url}
                      alt={`Frame ${i + 1}`}
                      className="rounded-lg w-full aspect-video object-cover border border-gray-200"
                    />
                    <span className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {i + 1} / {(analysis.frame_urls as string[]).length}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
