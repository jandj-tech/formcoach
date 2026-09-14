import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTeamSession } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import DashboardShell from '@/components/backend/DashboardShell'
import { backendButton } from '@/components/backend/button-styles'
import BulkUploader, { type RosterPlayer } from '@/components/BulkUploader'

export const metadata = { title: 'Upload a session — LearnHoops' }

export default async function BulkUploadPage() {
  const session = await getTeamSession()
  if (!session) redirect('/login')

  const [team] = (await db`
    SELECT id, name, access_code, credits FROM teams WHERE id = ${session.teamId}
  `) as unknown as [{ id: string; name: string; access_code: string; credits: number } | undefined]
  if (!team) redirect('/login')

  const roster = (await db`
    SELECT id, first_name, last_name_initial
    FROM team_players
    WHERE team_id = ${team.id}
    ORDER BY first_name ASC, last_name_initial ASC
  `) as unknown as RosterPlayer[]

  return (
    // Same shell as /team/dashboard: the ink canvas and the console-width
    // column. Without `dark:bg-ink-950` here the page keeps a white body while
    // the dark: text colours inside it still resolve, which reads as blank.
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <DashboardShell>
        <Link
          href="/team/dashboard"
          className="text-sm font-bold text-ember-600 dark:text-ember-400 hover:underline"
        >
          ← Back to {team.name}
        </Link>

        {roster.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-courtline bg-gray-50 dark:bg-ink-800 p-8 text-center">
            <p className="text-lg font-black text-gray-900 dark:text-chalk">Add your players first</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-chalk-dim">
              Uploading a session means telling us who is in each video, so the team needs a roster
              before this works. Add them on the dashboard and come back.
            </p>
            <Link href="/team/dashboard" className={backendButton('primary', 'mt-4')}>
              Go add players
            </Link>
          </div>
        ) : (
          <BulkUploader
            teamCode={team.access_code}
            roster={roster}
            credits={Number(team.credits) || 0}
          />
        )}
      </DashboardShell>
      <SiteFooter />
    </main>
  )
}
