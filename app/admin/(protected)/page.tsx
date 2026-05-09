import { db } from '@/lib/db'

export default async function AdminDashboard() {
  const [counts] = await db`
    SELECT
      (SELECT COUNT(*) FROM submissions WHERE status = 'complete') as total_analyses,
      (SELECT COUNT(*) FROM email_list WHERE unsubscribed_at IS NULL) as active_emails,
      (SELECT COUNT(*) FROM criterion_scores WHERE admin_score IS NOT NULL) as learn_corrections,
      (SELECT ROUND(AVG(overall_score), 1) FROM analyses) as avg_score
  `

  const stats = [
    { label: 'Total Analyses', value: counts.total_analyses ?? 0 },
    { label: 'Email Subscribers', value: counts.active_emails ?? 0 },
    { label: 'Learn Corrections', value: counts.learn_corrections ?? 0 },
    { label: 'Avg Overall Score', value: counts.avg_score ? `${counts.avg_score}/10` : '—' },
  ]

  const recent = await db`
    SELECT s.id, s.email, s.created_at, a.overall_score
    FROM submissions s
    LEFT JOIN analyses a ON a.submission_id = s.id
    WHERE s.status = 'complete'
    ORDER BY s.created_at DESC
    LIMIT 5
  `

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-white">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-slate-400 text-xs mb-1">{s.label}</p>
            <p className="text-white text-3xl font-black">{String(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-white font-bold text-lg">Recent Analyses</h2>
        <div className="bg-slate-800 rounded-xl border border-slate-700 divide-y divide-slate-700">
          {recent.length === 0 ? (
            <p className="text-slate-500 text-sm p-6">No analyses yet.</p>
          ) : (
            recent.map((row) => (
              <div key={String(row.id)} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-white text-sm">{row.email || '—'}</p>
                  <p className="text-slate-500 text-xs">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-orange-400 font-bold">
                  {row.overall_score ? `${row.overall_score}/10` : '—'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
