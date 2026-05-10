import { db } from '@/lib/db'

export default async function SubmissionsPage() {
  const submissions = await db`
    SELECT s.id, s.email, s.status, s.token, s.created_at, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    ORDER BY s.created_at DESC
    LIMIT 200
  `

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-white">All Submissions</h1>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs">
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Score</th>
              <th className="text-left px-5 py-3">Date</th>
              <th className="text-left px-5 py-3">Results</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {submissions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-zinc-500">No submissions yet.</td>
              </tr>
            ) : (
              submissions.map((s) => (
                <tr key={String(s.id)} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-5 py-3 text-white">{s.email || <span className="text-zinc-500">—</span>}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === 'complete' ? 'bg-green-500/10 text-green-400' :
                      s.status === 'processing' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-orange-400 font-bold">
                    {s.overall_score ? `${s.overall_score}/10` : '—'}
                  </td>
                  <td className="px-5 py-3 text-zinc-400 text-xs">
                    {new Date(s.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    {s.token && s.email ? (
                      <a
                        href={`/results/${s.token}`}
                        className="text-orange-400 hover:text-orange-300 text-xs underline"
                        target="_blank"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
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
