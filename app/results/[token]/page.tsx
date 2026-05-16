import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import OverallBadge from '@/components/OverallBadge'
import ScoreCard from '@/components/ScoreCard'
import { getCriteriaVideoMap } from '@/lib/youtube'
import FrameViewer from './FrameViewer'

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

  const scores = (await db`
    SELECT cs.id, cs.ai_score, cs.ai_reasoning, c.name, c.order_index
    FROM criterion_scores cs
    JOIN criteria c ON cs.criterion_id = c.id
    WHERE cs.analysis_id = ${analysis.id}
    ORDER BY c.order_index
  `) as unknown as Array<{
    id: number
    ai_score: number | null
    ai_reasoning: string
    name: string
    order_index: number
  }>

  // Load tutorial-video map for the criteria the player needs help with (≤ 6).
  // The video map function handles manual overrides and YouTube auto-matching.
  const needsHelp = scores
    .filter((s) => s.ai_score !== null && Number(s.ai_score) <= 6)
    .map((s) => s.name)
  const videoMap = needsHelp.length > 0 ? await getCriteriaVideoMap(needsHelp) : {}

  const frameUrls = (analysis.frame_urls as string[] | null) ?? []
  const hasFrames = frameUrls.length > 0
  const hasVideo = !!analysis.video_url

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-8">
        {/* Shop CTA — moved to the top so it's the first thing players see after opening their analysis. */}
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 sm:p-8 text-center">
          <h2 className="text-black font-black text-xl sm:text-2xl mb-2">
            Fix your form — faster.
          </h2>
          <p className="text-zinc-700 text-sm sm:text-base leading-relaxed mb-5 max-w-md mx-auto">
            The LearnHoops basketball has finger guides printed on the leather, game weight,
            and comes right- or left-handed. The fastest way to drill in the form your analysis is about to expose.
          </p>
          <Link
            href="/shop"
            className="inline-block bg-orange-500 hover:bg-red-600 text-white font-bold px-7 py-3 rounded-xl text-sm sm:text-base transition-colors"
          >
            Shop the Ball →
          </Link>
        </div>

        <div className="flex justify-center">
          <OverallBadge score={Number(analysis.overall_score)} />
        </div>

        {/* Your shot video + analyzed frames — kept near the top so the player
            sees their actual shot right after the score, not buried below. */}
        {hasVideo && (
          <div className="space-y-2">
            <h2 className="text-black font-bold text-base">Your Shot</h2>
            <video
              src={analysis.video_url as string}
              controls
              playsInline
              className="w-full rounded-xl bg-black border border-gray-200"
            />
          </div>
        )}

        {hasFrames && (
          <FrameViewer urls={frameUrls} compact={false} />
        )}

        <div className="space-y-3">
          {scores.map((s) => (
            <ScoreCard
              key={s.id}
              name={s.name}
              score={s.ai_score !== null ? Number(s.ai_score) : null}
              reasoning={s.ai_reasoning}
              videoId={videoMap[s.name]}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
