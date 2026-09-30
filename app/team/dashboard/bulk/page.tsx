import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTeamSession, provenTeamCoachCreditsEmail } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import DashboardShell from '@/components/backend/DashboardShell'
import { backendButton } from '@/components/backend/button-styles'
import BulkUploader from '@/components/BulkUploader'
import { loadTeamRosterEntries } from '@/lib/team-roster-refs'

export const metadata = { title: 'Upload a session — LearnHoops' }

export default async function BulkUploadPage() {
  const session = await getTeamSession()
  if (!session) redirect('/login')

  const [team] = (await db`
    SELECT t.id, t.name, t.access_code, t.admin_email, COALESCE(t.credits, 0)::int AS credits,
           t.organization_id, o.admin_email AS org_admin_email
    FROM teams t
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ${session.teamId}
  `) as unknown as [
    | {
        id: string
        name: string
        access_code: string
        admin_email: string
        credits: number
        organization_id: string | null
        org_admin_email: string | null
      }
    | undefined,
  ]
  if (!team) redirect('/login')

  // Every player on the team as its own row with a stable ref — account
  // players, name-only rows and invites are NEVER merged by name (two
  // "Liam S." are two people). /api/analyze resolves the ref within this team.
  const roster = await loadTeamRosterEntries(team.id)

  // The balance /api/analyze actually charges for a team upload: the head
  // coach's personal coach_credits first, then the legacy team budget.
  // Only when the head-coach row provably holds that email (the same rule the
  // charge uses — provenTeamCoachCreditsEmail).
  const headCreditsEmail = await provenTeamCoachCreditsEmail(team.id)
  const [cc] = headCreditsEmail
    ? ((await db`
        SELECT COALESCE(credits, 0)::int AS credits FROM coach_credits
        WHERE LOWER(email) = ${headCreditsEmail}
      `) as unknown as [{ credits: number } | undefined])
    : [undefined]
  const credits = (cc?.credits ?? 0) + (Number(team.credits) || 0)
  const me = session.adminEmail.toLowerCase()
  const youAreHeadCoach = me === team.admin_email.toLowerCase()
  // The org director "opened" this team from the org dashboard: their team
  // session carries the org's admin email. Offer the way back there too.
  const openedByOrg = !!team.org_admin_email && me === team.org_admin_email.toLowerCase()

  const links = openedByOrg
    ? {
        emailResults: { href: '/org/dashboard#results', label: 'Email the results from the Results tab' },
        getCredits: { href: '/org/dashboard#tokens', label: 'Send this team more tokens' },
      }
    : {
        emailResults: { href: '/team/dashboard#email', label: 'Email the results to players' },
        getCredits: team.organization_id
          ? { href: '/team/dashboard#credits', label: 'Ask your organization for more tokens, or buy some' }
          : { href: '/team/dashboard#credits', label: 'Buy more tokens' },
      }

  return (
    // Same shell as /team/dashboard: the ink canvas and the console-width
    // column. Without `dark:bg-ink-950` here the page keeps a white body while
    // the dark: text colours inside it still resolve, which reads as blank.
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <DashboardShell>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Link
            href="/team/dashboard"
            className="text-sm font-bold text-ember-600 dark:text-ember-400 hover:underline"
          >
            ← Back to {team.name}
          </Link>
          {openedByOrg && (
            <Link
              href="/org/dashboard"
              className="text-sm font-bold text-ember-600 dark:text-ember-400 hover:underline"
            >
              ← Back to the organization dashboard
            </Link>
          )}
        </div>

        {roster.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-courtline bg-gray-50 dark:bg-ink-800 p-8 text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-chalk">Add your players first</p>
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
            credits={credits}
            creditsOwner={youAreHeadCoach ? 'your' : 'the head coach’s'}
            links={links}
          />
        )}
      </DashboardShell>
      <SiteFooter />
    </main>
  )
}
