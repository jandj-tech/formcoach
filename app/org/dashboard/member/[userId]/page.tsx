import { redirect, notFound } from 'next/navigation'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import DashboardShell from '@/components/backend/DashboardShell'
import DashboardHeader from '@/components/backend/DashboardHeader'
import PlayerShotList from '@/components/PlayerShotList'

// Org-admin view of a player's analyzed shots — the player must be on a team in the org.
export default async function OrgMemberShotsPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getOrgSession()
  if (!session) redirect('/login')

  const { userId } = await params

  // Every team of this org the player is on (a player can be on several).
  const memberships = (await db`
    SELECT u.id, u.email, u.nickname, tm.first_name, tm.last_name_initial, t.name AS team_name
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ${userId} AND t.organization_id = ${session.orgId}
    ORDER BY t.name, t.id
  `) as unknown as Array<{
    id: string
    email: string
    nickname: string | null
    first_name: string | null
    last_name_initial: string | null
    team_name: string
  }>

  // The name as a roster spells it (the first team with one), else the account's.
  const player = memberships.find((m) => m.first_name) ?? memberships[0]
  if (!player) return notFound()

  const shots = (await db`
    SELECT s.id, s.token, s.created_at, a.overall_score, t.name AS team_name
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    JOIN teams t ON t.id = s.team_id
    -- Only shots filed to one of this organization's teams — never the
    -- player's personal self-paid shots or another organization's.
    WHERE s.user_id = ${player.id}
      AND t.organization_id = ${session.orgId}
    ORDER BY s.created_at DESC
    LIMIT 100
  `) as unknown as Array<{
    id: string
    token: string
    created_at: string
    overall_score: string | number | null
    team_name: string
  }>
  const teamNames = [...new Set(memberships.map((m) => m.team_name))]

  const playerName = player.first_name
    ? `${player.first_name}${player.last_name_initial ? ` ${player.last_name_initial}.` : ''}`
    : (player.nickname || player.email)

  // Another player on one of these teams shows the same name ("Liam B."
  // twice): the email under the heading says which one this is.
  let sharesName = false
  if (player.first_name) {
    const [twin] = (await db`
      SELECT 1 AS hit
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id AND t.organization_id = ${session.orgId}
      WHERE tm.team_id IN (SELECT team_id FROM team_memberships WHERE user_id = ${player.id})
        AND tm.user_id <> ${player.id}
        AND LOWER(TRIM(tm.first_name)) = LOWER(TRIM(${player.first_name}))
        AND UPPER(COALESCE(TRIM(tm.last_name_initial), '')) = UPPER(COALESCE(TRIM(${player.last_name_initial}), ''))
      LIMIT 1
    `) as unknown as Array<{ hit: number }>
    sharesName = !!twin
  }

  return (
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <DashboardShell>
        <DashboardHeader
          eyebrow="Player"
          title={<h1 className="text-2xl sm:text-3xl font-black text-black dark:text-chalk">{playerName}</h1>}
          meta={`${sharesName ? `${player.email} · ` : ''}${teamNames.join(' · ')} · ${shots.length} shot${shots.length !== 1 ? 's' : ''} analyzed`}
          back={{ href: '/org/dashboard', label: 'Back to organization dashboard' }}
        />

        <PlayerShotList shots={shots} />
      </DashboardShell>
      <SiteFooter />
    </main>
  )
}
