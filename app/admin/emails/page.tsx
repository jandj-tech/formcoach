import { db } from '@/lib/db'

export default async function EmailsPage() {
  const emails = await db`
    SELECT id, email, created_at, unsubscribed_at, marketing_emails_sent
    FROM email_list
    ORDER BY created_at DESC
    LIMIT 500
  `

  const active = emails.filter((e) => !e.unsubscribed_at)
  const unsub = emails.filter((e) => e.unsubscribed_at)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Email List</h1>
        <div className="flex gap-4 text-sm text-slate-400">
          <span><span className="text-green-400 font-bold">{active.length}</span> active</span>
          <span><span className="text-slate-500 font-bold">{unsub.length}</span> unsubscribed</span>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs">
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Marketing Emails Sent</th>
              <th className="text-left px-5 py-3">Joined</th>
              <th className="text-left px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {emails.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-slate-500">No subscribers yet.</td>
              </tr>
            ) : (
              emails.map((e) => (
                <tr key={String(e.id)} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 text-white">{e.email}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map((n) => (
                          <div
                            key={n}
                            className={`w-3 h-3 rounded-sm ${n <= e.marketing_emails_sent ? 'bg-orange-500' : 'bg-slate-700'}`}
                          />
                        ))}
                      </div>
                      <span className="text-slate-400 text-xs">{e.marketing_emails_sent}/5</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    {e.unsubscribed_at ? (
                      <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">Unsubscribed</span>
                    ) : (
                      <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">Active</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
