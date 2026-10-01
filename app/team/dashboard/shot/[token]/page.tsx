import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getTeamSession } from '@/lib/team-auth'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import DashboardShell from '@/components/backend/DashboardShell'
import DashboardHeader from '@/components/backend/DashboardHeader'
import { ArrowRightIcon } from 'lucide-react'
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
  // An org director's team session follows whichever team they opened last;
  // they may still open a shot from any of their organization's teams.
  const orgSession = await getOrgSession()
  if (!session && !orgSession) redirect('/login')

  const { token } = await params

  const [teamShot] = session ? (await db`
    SELECT s.id, s.token, s.created_at, s.is_free_preview, s.team_id
    FROM submissions s
    WHERE s.token = ${token}
      -- Filed to this team, and the player is still on its roster. Roster
      -- membership alone let a coach open (and annotate) any shot of a
      -- linked player — personal or another team's.
      AND s.team_id = ${session.teamId}
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
    { id: string; token: string; created_at: string; is_free_preview: boolean; team_id: string } | undefined,
  ] : [undefined]

  // Same rule, with the shot's own team standing in for the session's: filed
  // to one of this organization's teams, player still on that roster.
  const [orgShot] = !teamShot && orgSession ? (await db`
    SELECT s.id, s.token, s.created_at, s.is_free_preview, s.team_id
    FROM submissions s
    JOIN teams t ON t.id = s.team_id AND t.organization_id = ${orgSession.orgId}
    WHERE s.token = ${token}
      AND (
        EXISTS (
          SELECT 1 FROM team_players tp
          WHERE tp.id = s.team_player_id AND tp.team_id = s.team_id
        )
        OR EXISTS (
          SELECT 1 FROM team_memberships tm
          WHERE tm.team_id = s.team_id AND tm.user_id = s.user_id
        )
      )
  `) as unknown as [
    { id: string; token: string; created_at: string; is_free_preview: boolean; team_id: string } | undefined,
  ] : [undefined]

  const submission = teamShot ?? orgShot
  if (!submission) return notFound()
  // Notes save under the viewer's team session when there is one
  // (lib/coach-notes.ts), so while it points at another team the boxes would
  // fail to save — show the notes read-only and say how to edit.
  const canEdit = !!teamShot || !session

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

  const ownNotes = await getOwnNotes(analysis.id, submission.team_id)
  const [shotTeam] = canEdit ? [undefined] : ((await db`
    SELECT name FROM teams WHERE id = ${submission.team_id}
  `) as unknown as [{ name: string } | undefined])

  return (
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <DashboardShell>
        <DashboardHeader
          eyebrow="Coaching notes"
          title={<h1 className="text-2xl sm:text-3xl font-black text-black dark:text-chalk">Add your coaching notes</h1>}
          meta={
            <>
              Shot from {new Date(submission.created_at).toLocaleDateString()} · AI overall{' '}
              {analysis.overall_score !== null ? Number(analysis.overall_score).toFixed(1) : '—'}/10
            </>
          }
          back={teamShot
            ? { href: '/team/dashboard', label: 'Back to team dashboard' }
            : { href: '/org/dashboard', label: 'Back to organization dashboard' }}
        />

        <div>
          <p className="text-gray-500 dark:text-chalk-dim text-sm leading-relaxed">
            Your notes appear on the player&apos;s report underneath each score — the AI&apos;s grade
            is never changed or hidden. Add what you saw in person, especially where the video was
            blurry or the AI couldn&apos;t see. Your notes are also sent to LearnHoops for review.
          </p>
          <Link
            href={`/results/${submission.token}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500 transition-colors"
          >
            View the player&apos;s report
            <ArrowRightIcon aria-hidden className="w-4 h-4" />
          </Link>
          {!canEdit && (
            <p className="mt-3 text-sm text-gray-600 dark:text-chalk-dim leading-relaxed">
              You&apos;re working in another team right now, so notes are read-only here. To add
              notes, open {shotTeam?.name ?? 'this shot’s team'} from your organization dashboard, then
              come back to this shot.
            </p>
          )}
        </div>

        <div className="space-y-4">
          {scores.map((s) => {
            const ai = s.ai_score === null ? null : Number(s.ai_score)
            return (
              <div key={s.id} className="border border-gray-200 dark:border-courtline rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-black dark:text-chalk text-sm">{s.name}</h2>
                  {ai === null ? (
                    <span className="text-xs font-medium text-black dark:text-chalk bg-gray-200 dark:bg-ink-800 px-2 py-0.5 rounded-full shrink-0">
                      Not graded
                    </span>
                  ) : (
                    <span className="text-2xl font-bold text-black dark:text-chalk shrink-0">
                      {ai.toFixed(1)}
                      <span className="text-sm font-normal">/10</span>
                    </span>
                  )}
                </div>
                <p className="text-gray-600 dark:text-chalk-dim text-xs mt-1.5 leading-relaxed">{s.ai_reasoning}</p>
                {canEdit ? (
                  <CoachNoteEditor
                    criterionScoreId={s.id}
                    aiScore={ai}
                    endpoint="/api/coach-note"
                    initial={ownNotes.get(s.id) ?? null}
                  />
                ) : (() => {
                  const n = ownNotes.get(s.id)
                  if (!n || (n.note === null && n.suggestedScore === null)) return null
                  return (
                    <p className="mt-3 text-sm text-gray-700 dark:text-chalk">
                      <span className="font-semibold">Coach&apos;s note{n.suggestedScore !== null ? ` (${n.suggestedScore}/10)` : ''}:</span>{' '}
                      {n.note}
                    </p>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </DashboardShell>
      <SiteFooter />
    </main>
  )
}
