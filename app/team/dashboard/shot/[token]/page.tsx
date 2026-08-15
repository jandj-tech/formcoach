import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getTeamSession } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import CoachNoteEditor from '@/components/CoachNoteEditor'
import { getOwnNotes } from '@/lib/coach-notes'

// Coach's criterion-by-criterion view of one shot, with a Coach's Note box on
// every criterion. Coaches previously had no criterion-level view at all —
// they bounced to the public /results/{token} page, which has no session and
// therefore no way to offer editing.
//
// The token alone is NOT authorization: a coach handed any results link must
// not be able to annotate it, so the submission is re-proved against this
// coach's roster below.
export default async function CoachShotPage({ params }: { params: Promise<{ token: string }> }) {
  const session = await getTeamSession()
  if (!session) redirect('/login')

  const { token } = await params

  const [submission] = (await db`
    SELECT s.id, s.token, s.created_at, s.is_free_preview
    FROM submissions s
    WHERE s.token = ${token}
      AND (
        EXISTS (
          SELECT 1 FROM team_players tp
          WHERE tp.id = s.team_player_id AND tp.team_id = ${session.teamId}
        )
        OR EXISTS (
          SELECT 1 FROM team_memberships tm
          WHERE tm.team_id = ${session.teamId} AND tm.user_id = s.user_id
        )
      )
  `) as unknown as [
    { id: string; token: string; created_at: string; is_free_preview: boolean } | undefined,
  ]

  if (!submission) return notFound()

  const [analysis] = (await db`
    SELECT id, overall_score
    FROM analyses
    WHERE submission_id = ${submission.id}
    ORDER BY created_at DESC
    LIMIT 1
  `) as unknown as [{ id: number; overall_score: string | number | null } | undefined]

  if (!analysis) return notFound()

  const scores = (await db`
    SELECT cs.id, cs.ai_score, cs.ai_reasoning, c.name
    FROM criterion_scores cs
    JOIN criteria c ON c.id = cs.criterion_id
    WHERE cs.analysis_id = ${analysis.id}
    ORDER BY c.order_index
  `) as unknown as Array<{
    id: number
    ai_score: string | null
    ai_reasoning: string
    name: string
  }>

  const ownNotes = await getOwnNotes(analysis.id, session.teamId)

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
        <Link href="/team/dashboard" className="text-sm text-orange-500 hover:underline">
          ← Back to team dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-black text-black">Add your coaching notes</h1>
          <p className="text-gray-500 text-sm mt-1">
            Shot from {new Date(submission.created_at).toLocaleDateString()} · AI overall{' '}
            {analysis.overall_score !== null ? Number(analysis.overall_score).toFixed(1) : '—'}/10
          </p>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            Your notes appear on the player&apos;s report underneath each score — the AI&apos;s grade
            is never changed or hidden. Add what you saw in person, especially where the video was
            blurry or the AI couldn&apos;t see. Your notes are also sent to LearnHoops for review.
          </p>
          <Link
            href={`/results/${submission.token}`}
            target="_blank"
            className="inline-block mt-2 text-sm font-semibold text-orange-500 hover:underline"
          >
            View the player&apos;s report →
          </Link>
        </div>

        <div className="space-y-4">
          {scores.map((s) => {
            const ai = s.ai_score === null ? null : Number(s.ai_score)
            return (
              <div key={s.id} className="border border-gray-200 rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-black text-sm">{s.name}</h2>
                  {ai === null ? (
                    <span className="text-xs font-medium text-black bg-gray-200 px-2 py-0.5 rounded-full shrink-0">
                      Not graded
                    </span>
                  ) : (
                    <span className="text-2xl font-bold text-black shrink-0">
                      {ai.toFixed(1)}
                      <span className="text-sm font-normal">/10</span>
                    </span>
                  )}
                </div>
                <p className="text-gray-600 text-xs mt-1.5 leading-relaxed">{s.ai_reasoning}</p>
                <CoachNoteEditor
                  criterionScoreId={s.id}
                  aiScore={ai}
                  endpoint="/api/team/coach-note"
                  initial={ownNotes.get(s.id) ?? null}
                />
              </div>
            )
          })}
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
