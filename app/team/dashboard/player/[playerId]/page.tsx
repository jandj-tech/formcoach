import { redirect, notFound } from 'next/navigation'
import { getTeamSession } from '@/lib/team-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import DashboardShell from '@/components/backend/DashboardShell'
import DashboardHeader from '@/components/backend/DashboardHeader'
import PlayerShotList from '@/components/PlayerShotList'

// Coach/team-admin view of a single player's analyzed shots and scores.
export default async function TeamPlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const session = await getTeamSession()
  if (!session) redirect('/login')

  const { playerId } = await params

  const [player] = (await db`
    SELECT id, first_name, last_name_initial
    FROM team_players
    WHERE id = ${playerId} AND team_id = ${session.teamId}
  `) as unknown as [{ id: string; first_name: string; last_name_initial: string | null } | undefined]

  if (!player) return notFound()

  const shots = (await db`
    SELECT s.id, s.token, s.created_at, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    WHERE s.team_player_id = ${playerId} AND s.team_id = ${session.teamId}
    ORDER BY s.created_at DESC
  `) as unknown as Array<{
    id: string
    token: string
    created_at: string
    overall_score: string | number | null
  }>

  const playerName = `${player.first_name}${player.last_name_initial ? ` ${player.last_name_initial}.` : ''}`

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
