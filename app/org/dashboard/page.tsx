import { redirect } from 'next/navigation'
import { getOrgSession } from '@/lib/org-auth'
import { db } from '@/lib/db'
import TopNav from '@/components/TopNav'
import OrgDashboardClient from './OrgDashboardClient'
import LogoutButton from './LogoutButton'

interface Member {
  id: string
  email: string
  tokens: number
}

interface TeamData {
  id: string
  name: string
  ageGroup: string | null
  accessCode: string
  members: Member[]
}

export default async function OrgDashboardPage() {
  const session = await getOrgSession()
  if (!session) redirect('/org/login')

  const [org] = await db`
    SELECT id, name, access_code
    FROM organizations WHERE id = ${session.orgId}
  ` as unknown as [{ id: string; name: string; access_code: string } | undefined]

  if (!org) redirect('/org/login')

  let teams: TeamData[] = []

  try {
    const teamRows = (await db`
      SELECT id, name, age_group, access_code
      FROM teams WHERE organization_id = ${org.id}
      ORDER BY created_at ASC
    `) as unknown as Array<{ id: string; name: string; age_group: string | null; access_code: string }>

    teams = await Promise.all(
      teamRows.map(async (t) => {
        const members = (await db`
          SELECT u.id, u.email, COALESCE(u.analysis_tokens, 0)::int AS tokens
          FROM team_memberships tm
          JOIN users u ON u.id = tm.user_id
          WHERE tm.team_id = ${t.id}
          ORDER BY u.email ASC
        `) as unknown as Member[]
        return {
          id: t.id,
          name: t.name,
          ageGroup: t.age_group,
          accessCode: t.access_code,
          members,
        }
      })
    )
  } catch (err) {
    console.error('[org/dashboard] load error:', err)
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="max-w-3xl mx-auto w-full px-6 py-10 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-black">{org.name}</h1>
            <p className="text-gray-500 text-sm mt-1">Organization Dashboard</p>
          </div>
          <LogoutButton />
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6">
          <p className="text-sm text-gray-500">Organization code</p>
          <p className="text-2xl font-black text-black font-mono tracking-wider">{org.access_code}</p>
          <p className="text-xs text-gray-400 mt-1">
            Coaches enter this code when registering a team to link it to your organization.
          </p>
        </div>

        <OrgDashboardClient teams={teams} />
      </div>
    </main>
  )
}
