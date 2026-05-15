import { db } from '@/lib/db'

type AccountRow = {
  id: string
  email: string
  subscription_type: string | null
  subscription_expires_at: string | null
  analysis_tokens: number | null
  created_at: string
  shot_count: number
}

export default async function AccountsPage() {
  const accounts = (await db`
    SELECT
      u.id,
      u.email,
      u.subscription_type,
      u.subscription_expires_at,
      u.analysis_tokens,
      u.created_at,
      COUNT(DISTINCT s.id)::int AS shot_count
    FROM users u
    LEFT JOIN submissions s ON s.user_id = u.id OR s.email = u.email
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT 500
  `) as unknown as AccountRow[]

  const freeCount = accounts.filter(
    (a) =>
      !!a.subscription_type &&
      !!a.subscription_expires_at &&
      new Date(a.subscription_expires_at) > new Date()
  ).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Accounts</h1>
        <div className="flex gap-4 text-sm text-white">
          <span><span className="text-orange-500 font-bold">{accounts.length}</span> registered</span>
          <span><span className="text-orange-500 font-bold">{freeCount}</span> free / subscribed</span>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-white text-xs">
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Shots</th>
              <th className="text-left px-5 py-3">Access</th>
              <th className="text-left px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-white">No accounts yet.</td>
              </tr>
            ) : (
              accounts.map((a) => {
                const subscribed =
                  !!a.subscription_type &&
                  !!a.subscription_expires_at &&
                  new Date(a.subscription_expires_at) > new Date()
                const tokens = a.analysis_tokens ?? 0
                return (
                  <tr key={a.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3 text-white">{a.email}</td>
                    <td className="px-5 py-3 text-white">{a.shot_count}</td>
                    <td className="px-5 py-3">
                      {subscribed ? (
                        <span className="text-xs bg-green-500/10 text-orange-500 px-2 py-0.5 rounded-full capitalize">
                          {a.subscription_type === 'complimentary' ? 'Free account' : a.subscription_type}
                        </span>
                      ) : (
                        <span className="text-xs bg-zinc-800 text-white px-2 py-0.5 rounded-full">
                          Pay-per-use · {tokens} token{tokens === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-white text-xs">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
