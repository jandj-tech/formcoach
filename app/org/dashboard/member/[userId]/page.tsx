import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import PlayerShotList from '@/components/PlayerShotList'

// Org-admin view of a player's analyzed shots — the player must be on a team in the org.
export default async function OrgMemberShotsPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getOrgSession()
  if (!session) redirect('/org/login')

  const { userId } = await params

  const [player] = (await db`
    SELECT u.id, u.email, u.nickname, tm.first_name, tm.last_name_initial, t.name AS team_name
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ${userId} AND t.organization_id = ${session.orgId}
    LIMIT 1
  `) as unknown as [{
    id: string
    email: string
    nickname: string | null
    first_name: string | null
    last_name_initial: string | null
    team_name: string
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
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-6">
        <Link href="/org/dashboard" className="text-sm text-orange-500 hover:underline">
          ← Back to organization dashboard
        </Link>

        <div>
          <h1 className="text-2xl font-black text-black">{playerName}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {player.team_name} · {shots.length} shot{shots.length !== 1 ? 's' : ''} analyzed
          </p>
        </div>

        <PlayerShotList shots={shots} />
      </div>
    </main>
  )
}
