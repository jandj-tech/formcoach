import { db } from '@/lib/db'
import { orgSignupLink } from '@/lib/email'
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
  signupLink: string | null
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
    const rows = (await db`
      SELECT id, org_name, email, player_count, status, created_at, signup_token
      FROM org_applications
      ORDER BY created_at DESC
      LIMIT 200
    `) as unknown as (Omit<ApplicationRow, 'signupLink'> & { signup_token: string | null })[]
    applications = rows.map(({ signup_token, ...rest }) => ({
      ...rest,
      signupLink: signup_token ? orgSignupLink(signup_token) : null,
    }))
  } catch (err) {
    console.error('[admin/organizations] applications query failed:', err)
  }

  const pending = applications.filter(a => a.status === 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-black dark:text-white">Organizations</h1>
        <span className="text-sm text-black dark:text-white">
          <span className="text-orange-500 font-bold">{orgs.length}</span> total
          {pending.length > 0 && (
            <span className="ml-3 bg-orange-500 text-ink-950 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length} pending
            </span>
          )}
        </span>
      </div>

      {/* Applications */}
      <OrgApplicationsClient initialApplications={applications} />

      {/* Registered orgs */}
      <div>
        <h2 className="text-lg font-black text-black dark:text-white mb-3">Registered Organizations</h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-800 text-black dark:text-white text-xs">
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
                  <td colSpan={6} className="px-5 py-6 text-black dark:text-white">No organizations yet.</td>
                </tr>
              ) : (
                orgs.map((o) => (
                  <tr key={o.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3 text-black dark:text-white font-semibold">{o.name}</td>
                    <td className="px-5 py-3 text-black dark:text-white">{o.admin_email}</td>
                    <td className="px-5 py-3 font-mono text-black dark:text-white">{o.access_code}</td>
                    <td className="px-5 py-3 text-black dark:text-white">{o.team_count}</td>
                    <td className="px-5 py-3 text-black dark:text-white text-xs">
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
        <p className="text-xs text-gray-500 dark:text-zinc-500 mt-2">
          Passwords are encrypted and can&apos;t be displayed. Use &quot;Reset password&quot; to set a new one.
        </p>
      </div>
    </div>
  )
}
