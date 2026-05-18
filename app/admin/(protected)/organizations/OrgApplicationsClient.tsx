'use client'

import { useState } from 'react'

type ApplicationRow = {
  id: string
  org_name: string
  email: string
  player_count: number | null
  status: string
  created_at: string
}

export default function OrgApplicationsClient({ initialApplications }: { initialApplications: ApplicationRow[] }) {
  const [applications, setApplications] = useState(initialApplications)
  const [approving, setApproving] = useState<string | null>(null)
  const [approved, setApproved] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<Record<string, string>>({})

  const pending = applications.filter(a => a.status === 'pending')
  const others = applications.filter(a => a.status !== 'pending')

  async function handleApprove(id: string) {
    setApproving(id)
    setError(prev => ({ ...prev, [id]: '' }))
    try {
      const res = await fetch('/api/admin/org-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(prev => ({ ...prev, [id]: data.error || 'Failed' }))
      } else {
        setApproved(prev => ({ ...prev, [id]: true }))
        setApplications(prev => prev.map(a => a.id === id ? { ...a, status: 'approved' } : a))
      }
    } catch {
      setError(prev => ({ ...prev, [id]: 'Something went wrong' }))
    }
    setApproving(null)
  }

  return (
    <div>
      <h2 className="text-lg font-black text-white mb-3">
        Applications
        {pending.length > 0 && (
          <span className="ml-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length} pending</span>
        )}
      </h2>

      {applications.length === 0 ? (
        <p className="text-zinc-400 text-sm">No applications yet.</p>
      ) : (
        <div className="space-y-4">
          {/* Pending */}
          {pending.length > 0 && (
            <div className="bg-zinc-900 rounded-xl border border-orange-500/30 overflow-hidden">
              <div className="px-5 py-2.5 border-b border-zinc-800 bg-orange-500/10">
                <span className="text-orange-400 text-xs font-bold uppercase tracking-wide">Pending review</span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {pending.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-white font-bold">{a.org_name}</p>
                      <p className="text-zinc-400 text-sm">{a.email}</p>
                      {a.player_count != null && (
                        <p className="text-zinc-500 text-xs">{a.player_count} players</p>
                      )}
                      <p className="text-zinc-600 text-xs">{new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {error[a.id] && <p className="text-red-400 text-xs">{error[a.id]}</p>}
                      {approved[a.id] ? (
                        <span className="text-green-400 text-sm font-bold">✓ Approved — email sent</span>
                      ) : (
                        <button
                          onClick={() => handleApprove(a.id)}
                          disabled={approving === a.id}
                          className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                        >
                          {approving === a.id ? 'Approving…' : 'Approve & send link'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past applications */}
          {others.length > 0 && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
              <div className="px-5 py-2.5 border-b border-zinc-800">
                <span className="text-zinc-400 text-xs font-bold uppercase tracking-wide">Past applications</span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {others.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3 flex-wrap">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-white font-semibold text-sm">{a.org_name}</p>
                      <p className="text-zinc-500 text-xs">{a.email}{a.player_count != null ? ` · ${a.player_count} players` : ''}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      a.status === 'approved' ? 'bg-green-900/40 text-green-400' :
                      a.status === 'registered' ? 'bg-blue-900/40 text-blue-400' :
                      'bg-zinc-700 text-zinc-400'
                    }`}>
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
