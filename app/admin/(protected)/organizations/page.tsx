import { db } from '@/lib/db'
import ResetOrgPasswordButton from './ResetOrgPasswordButton'

type OrgRow = {
  id: string
  name: string
  admin_email: string
  access_code: string
  created_at: string
  team_count: number
}

export default async function OrganizationsPage() {
  let orgs: OrgRow[] = []
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
    console.error('[admin/organizations] query failed:', err)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Organizations</h1>
        <span className="text-sm text-white">
          <span className="text-orange-500 font-bold">{orgs.length}</span> total
        </span>
      </div>

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

      <p className="text-xs text-zinc-500">
        Passwords are encrypted (hashed) and can&apos;t be displayed. Use &quot;Reset password&quot;
        to set a new one, then share it with the organization.
      </p>
    </div>
  )
}
