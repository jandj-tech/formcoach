import { redirect, notFound } from 'next/navigation'
import { getTeamSession } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import DashboardShell from '@/components/backend/DashboardShell'
import DashboardHeader from '@/components/backend/DashboardHeader'
import PlayerShotList from '@/components/PlayerShotList'

// Coach view of a roster player's analyzed shots.
export default async function TeamMemberShotsPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getTeamSession()
  if (!session) redirect('/login')

  const { userId } = await params

  // The player must be a member of the coach's own team.
  const [player] = (await db`
    SELECT u.id, u.email, u.nickname, tm.first_name, tm.last_name_initial
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.user_id = ${userId} AND tm.team_id = ${session.teamId}
  `) as unknown as [{
    id: string
    email: string
    nickname: string | null
    first_name: string | null
    last_name_initial: string | null
  } | undefined]

  if (!player) return notFound()

  const shots = (await db`
    SELECT s.id, s.token, s.created_at, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    WHERE s.user_id = ${player.id} OR s.email = ${player.email}
    ORDER BY s.created_at DESC
    LIMIT 100
  `) as unknown as Array<{ id: string; token: string; created_at: string; overall_score: string | number | null }>

  const playerName = player.first_name
    ? `${player.first_name}${player.last_name_initial ? ` ${player.last_name_initial}.` : ''}`
    : (player.nickname || player.email)

  return (
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <DashboardShell>
        <DashboardHeader
          eyebrow="Player"
          title={<h1 className="text-2xl sm:text-3xl font-black text-black dark:text-chalk">{playerName}</h1>}
          meta={`${shots.length} shot${shots.length !== 1 ? 's' : ''} analyzed`}
          back={{ href: '/team/dashboard', label: 'Back to team dashboard' }}
        />

        <PlayerShotList shots={shots} showNotesLink />
      </DashboardShell>
      <SiteFooter />
    </main>
  )
}
