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
          <video
            src={analysis.video_url as string}
            controls
            playsInline
            className="w-full rounded-xl bg-black border border-gray-200"
          />
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
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {(analysis.frame_urls as string[]).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Frame ${i + 1}`}
                className="rounded-lg w-full aspect-video object-cover border border-gray-200"
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
