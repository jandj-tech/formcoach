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
  // A frame image used as the video's poster, so the player shows a real
  // preview instead of a blank black box before it's played.
  const videoPoster = hasFrames
    ? frameUrls[Math.floor(frameUrls.length / 2)]
    : undefined

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-500 hover:text-orange-400 transition-colors"
        >
          <span aria-hidden>←</span> Back to LearnHoops
        </Link>

        {/* Shop CTA — moved to the top so it's the first thing players see after opening their analysis. */}
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 sm:p-8 text-center">
          <h2 className="text-black font-black text-xl sm:text-2xl mb-2">
            Fix your form — faster.
          </h2>
          <p className="text-zinc-700 text-sm sm:text-base leading-relaxed mb-5 max-w-md mx-auto">
            The LearnHoops basketball has finger placement guides on the surface and comes in
            right- and left-handed versions. The fastest way to drill in the form your analysis is about to expose.
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

        {(hasFrames || hasVideo) && (
          <div
            className={
              hasFrames && hasVideo
                ? 'grid grid-cols-1 md:grid-cols-2 gap-6 items-start'
                : ''
            }
          >
            {hasFrames && <FrameViewer urls={frameUrls} compact={hasVideo} />}

            {hasVideo && (
              <div className="space-y-2">
                <h2 className="text-black font-bold text-sm">Your Shot</h2>
                <video
                  src={analysis.video_url as string}
                  poster={videoPoster}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-w-sm rounded-xl bg-black border border-gray-200"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
