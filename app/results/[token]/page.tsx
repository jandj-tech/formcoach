import { Fragment } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import { db } from '@/lib/db'
import OverallBadge from '@/components/OverallBadge'
import ScoreCard from '@/components/ScoreCard'
import { getCriteriaVideoMap } from '@/lib/youtube'
import FrameViewer from './FrameViewer'
import ShareResultButton from './ShareResultButton'

// Share-friendly metadata: when a player sends their results link to a
// teammate, the preview shows their score (the OG image comes from the
// colocated opengraph-image.tsx). No player names — results may belong
// to youth players.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  let score: number | null = null
  try {
    const [row] = (await db`
      SELECT a.overall_score
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      WHERE s.token = ${token}
      ORDER BY a.created_at DESC
      LIMIT 1
    `) as unknown as [{ overall_score: string | number | null } | undefined]
    if (row?.overall_score != null) score = Number(row.overall_score)
  } catch {
    // Fall back to generic metadata if the DB is unreachable.
  }

  const hasScore = score !== null && !Number.isNaN(score)
  const title = hasScore
    ? `I scored ${score!.toFixed(1)}/10 on LearnHoops 🏀`
    : 'AI Shot Analysis — LearnHoops.com'
  const description = hasScore
    ? 'My jump shot, graded by AI across 18 shooting-form criteria. Upload yours and see if you can beat me.'
    : 'Upload a video of your jump shot and get graded across 18 shooting-form criteria in minutes.'

  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

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

  // Load tutorial-video map for the criteria the player needs help with (< 7.5).
  // The video map function handles manual overrides and YouTube auto-matching.
  const needsHelp = scores
    .filter((s) => s.ai_score !== null && Number(s.ai_score) < 7.5)
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
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 space-y-10">
        {/* Report header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-1.5">
              AI Shot Analysis
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-black leading-tight">
              Your Shot Report
            </h1>
          </div>
          <ShareResultButton
            score={analysis.overall_score != null ? Number(analysis.overall_score) : null}
          />
        </div>

        {/* Overall score */}
        <section className="bg-gradient-to-b from-orange-50/70 to-white border border-orange-100 rounded-2xl py-7 flex justify-center">
          <OverallBadge score={Number(analysis.overall_score)} />
        </section>

        {/* Criteria breakdown, with a compact shop ad slotted between cards */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-black font-black text-lg sm:text-xl">Criteria breakdown</h2>
            <span className="text-xs text-gray-400">
              {scores.filter((s) => s.ai_score !== null).length} of {scores.length} criteria graded
            </span>
          </div>
          {scores.map((s, i) => (
            <Fragment key={s.id}>
              <ScoreCard
                name={s.name}
                score={s.ai_score !== null ? Number(s.ai_score) : null}
                reasoning={s.ai_reasoning}
                videoId={videoMap[s.name]}
              />
              {i === 1 && (
                <aside className="relative flex items-center gap-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 pr-5">
                  <span className="absolute top-2 right-3 text-[9px] font-bold uppercase tracking-widest text-orange-300 select-none">
                    From our shop
                  </span>
                  <Image
                    src="/training-ball.png"
                    alt="LearnHoops Training Ball"
                    width={128}
                    height={128}
                    className="w-16 h-16 sm:w-20 sm:h-20 object-contain shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-black font-black text-sm leading-snug">
                      Train the habits this report grades
                    </p>
                    <p className="text-zinc-600 text-xs leading-relaxed mt-1">
                      The LearnHoops Training Ball&apos;s finger-placement guides drill in correct
                      form on every rep — free shot analyses included.
                    </p>
                    <Link
                      href="/shop"
                      className="inline-block mt-2 bg-orange-500 hover:bg-red-600 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      Shop the Ball →
                    </Link>
                  </div>
                </aside>
              )}
            </Fragment>
          ))}
        </section>

        {(hasFrames || hasVideo) && (
          <section className="space-y-3">
            <h2 className="text-black font-black text-lg sm:text-xl">Your shot</h2>
            <div
              className={
                hasFrames && hasVideo
                  ? 'grid grid-cols-1 md:grid-cols-2 gap-6 items-start'
                  : ''
              }
            >
              {hasFrames && <FrameViewer urls={frameUrls} compact={hasVideo} />}

              {hasVideo && (
                <video
                  src={analysis.video_url as string}
                  poster={videoPoster}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-w-sm rounded-xl bg-black border border-gray-200"
                />
              )}
            </div>
          </section>
        )}

        {/* Filming tips — the same guidance as the support FAQ, shown here so
            players can improve their next upload straight from their results. */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sm:p-8">
          <h2 className="text-black font-black text-lg sm:text-xl mb-2">
            How to get the best results
          </h2>
          <p className="text-zinc-700 text-sm leading-relaxed">
            For the most accurate analysis, film from under or near the net — either directly
            behind the basket or slightly to the side, at an angle where the shooter&apos;s elbow,
            arms, and hands are all clearly visible throughout the shot. This gives the AI a clear
            view of arm mechanics, elbow alignment, and release. Avoid filming directly face-on, as
            key form details are hidden from that perspective.
          </p>
          <p className="text-zinc-700 text-sm leading-relaxed mt-3">
            Shot arc and ball rotation need the ball itself in frame and in focus the whole way to
            the rim. When the footage can&apos;t show that, we leave those criteria ungraded rather
            than estimate them — a guessed score would skew your overall number.{' '}
            <Link
              href="/support#filming"
              className="font-bold text-orange-500 hover:text-red-600 underline underline-offset-2 transition-colors"
            >
              Full filming guide →
            </Link>
          </p>
        </div>

        {/* Content report (guideline 1.2): every publicly viewable result can be flagged. */}
        <p className="text-center text-xs text-gray-400">
          See something inappropriate on this page?{' '}
          <a
            href={`mailto:support@learnhoops.com?subject=${encodeURIComponent('Content report')}&body=${encodeURIComponent(`Reporting content at: https://learnhoops.com/results/${token}`)}`}
            className="underline hover:text-gray-600"
          >
            Report it
          </a>
          {' '}— we review reports within 24 hours.
        </p>
      </div>
      <SiteFooter />
    </main>
  )
}
