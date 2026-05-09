import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import OverallBadge from '@/components/OverallBadge'
import ScoreCard from '@/components/ScoreCard'
import TopNav from '@/components/TopNav'

export default async function ResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const [submission] = await db`
    SELECT id, email, status FROM submissions WHERE token = ${token}
  `

  if (!submission || !submission.email) return notFound()

  const [analysis] = await db`
    SELECT a.id, a.overall_score, a.frame_urls
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
    <main className="min-h-screen bg-slate-900 flex flex-col">
      <TopNav />

      <div className="max-w-2xl mx-auto w-full px-6 py-12 space-y-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-white">Your Shot Analysis</h1>
          <p className="text-slate-400 text-sm">Here&apos;s how your form scored across all criteria</p>
        </div>

        {/* Overall Score */}
        <div className="flex justify-center">
          <OverallBadge score={Number(analysis.overall_score)} />
        </div>

        {/* Criteria Breakdown */}
        <div className="space-y-4">
          <h2 className="text-white font-bold text-lg">Criteria Breakdown</h2>
          <div className="space-y-3">
            {scores.map((s) => (
              <ScoreCard
                key={s.id}
                name={s.name}
                score={Number(s.ai_score)}
                reasoning={s.ai_reasoning}
              />
            ))}
          </div>
        </div>

        {/* Frame Thumbnails */}
        {analysis.frame_urls && analysis.frame_urls.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-white font-bold text-lg">Analyzed Frames</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {(analysis.frame_urls as string[]).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Frame ${i + 1}`}
                  className="rounded-lg w-full aspect-video object-cover border border-slate-700"
                />
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 text-center space-y-3">
          <p className="text-white font-semibold">Want to analyze another shot?</p>
          <Link
            href="/analyze"
            className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Upload Another Video
          </Link>
        </div>
      </div>

      <footer className="py-6 border-t border-slate-800 text-center text-slate-600 text-xs">
        © {new Date().getFullYear()} FormCoach. All rights reserved.
      </footer>
    </main>
  )
}
