import { db } from '@/lib/db'
import ResetOrgPasswordButton from './ResetOrgPasswordButton'
import OrgApplicationsClient from './OrgApplicationsClient'

type OrgRow = {
  id: string
  name: string
  admin_email: string
  access_code: string
  created_at: string
  team_count: number
}

type ApplicationRow = {
  id: string
  org_name: string
  email: string
  player_count: number | null
  status: string
  created_at: string
}

export default async function OrganizationsPage() {
  let orgs: OrgRow[] = []
  let applications: ApplicationRow[] = []

  try {
    orgs = (await db`
      SELECT o.id, o.name, o.admin_email, o.access_code, o.created_at,
             COUNT(t.id)::int AS team_count
      FROM organizations o
      LEFT JOIN teams t ON t.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 500
    `) as unknown as OrgRow[]
  } catch (err) {
    console.error('[admin/organizations] orgs query failed:', err)
  }

  try {
    applications = (await db`
      SELECT id, org_name, email, player_count, status, created_at
      FROM org_applications
      ORDER BY created_at DESC
      LIMIT 200
    `) as unknown as ApplicationRow[]
  } catch (err) {
    console.error('[admin/organizations] applications query failed:', err)
  }

  const pending = applications.filter(a => a.status === 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Organizations</h1>
        <span className="text-sm text-white">
          <span className="text-orange-500 font-bold">{orgs.length}</span> total
          {pending.length > 0 && (
            <span className="ml-3 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length} pending
            </span>
          )}
        </span>
      </div>

      {/* Applications */}
      <OrgApplicationsClient initialApplications={applications} />

      {/* Registered orgs */}
      <div>
        <h2 className="text-lg font-black text-white mb-3">Registered Organizations</h2>
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-white text-xs">
                <th className="text-left px-5 py-3">Organization</th>
                <th className="text-left px-5 py-3">Admin email</th>
                <th className="text-left px-5 py-3">Org code</th>
                <th className="text-left px-5 py-3">Teams</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="text-left px-5 py-3">Password</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {orgs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-white">No organizations yet.</td>
                </tr>
              ) : (
                orgs.map((o) => (
                  <tr key={o.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3 text-white font-semibold">{o.name}</td>
                    <td className="px-5 py-3 text-white">{o.admin_email}</td>
                    <td className="px-5 py-3 font-mono text-white">{o.access_code}</td>
                    <td className="px-5 py-3 text-white">{o.team_count}</td>
                    <td className="px-5 py-3 text-white text-xs">
                      {new Date(o.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <ResetOrgPasswordButton orgId={o.id} orgName={o.name} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Passwords are encrypted and can&apos;t be displayed. Use &quot;Reset password&quot; to set a new one.
        </p>
      </div>
    </div>
  )
}
