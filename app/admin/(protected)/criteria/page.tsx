'use client'

import { useEffect, useState } from 'react'

interface Criterion {
  id: number
  name: string
  description: string
  weight: number
  order_index: number
  active: boolean
}

export default function CriteriaPage() {
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [editing, setEditing] = useState<Criterion | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const res = await fetch('/api/admin/criteria')
    const data = await res.json()
    setCriteria(data)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  async function save(action: string, payload: object) {
    setSaving(true)
    setMsg('')
    try {
      await fetch('/api/admin/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      await load()
      setEditing(null)
      setMsg('Saved!')
    } catch {
      setMsg('Error saving')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: Criterion) {
    await save('update', { ...c, active: !c.active })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">Scoring Criteria</h1>
        <button
          onClick={() => setEditing({ id: 0, name: '', description: '', weight: 1.0, order_index: 99, active: true })}
          className="bg-orange-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + Add Criterion
        </button>
      </div>

      {msg && <p className="text-orange-500 text-sm">{msg}</p>}

      <div className="space-y-2">
        {criteria.map((c) => (
          <div
            key={c.id}
            className={`bg-zinc-900 rounded-xl border p-4 flex items-start justify-between gap-4 ${c.active ? 'border-zinc-800' : 'border-zinc-800 opacity-50'}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-xs font-mono">{c.order_index}.</span>
                <span className="text-white font-semibold text-sm">{c.name}</span>
                <span className="text-white text-xs">weight: {c.weight}</span>
                {!c.active && <span className="text-xs bg-zinc-800 text-white px-2 py-0.5 rounded-full">inactive</span>}
              </div>
              {c.description && (
                <p className="text-white text-xs mt-1 leading-relaxed">{c.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleActive(c)}
                className="text-xs text-white hover:text-white px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
              >
                {c.active ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => setEditing(c)}
                className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded border border-orange-500/30 hover:border-orange-500 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 w-full max-w-md space-y-4">
            <h2 className="text-white font-bold text-lg">{editing.id ? 'Edit Criterion' : 'New Criterion'}</h2>

            <div className="space-y-3">
              <div>
                <label className="text-white text-xs mb-1 block">Name</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-white text-xs mb-1 block">Description (shown to AI)</label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white text-xs mb-1 block">Weight (0.1–2.0)</label>
                  <input
                    type="number"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={editing.weight}
                    onChange={(e) => setEditing({ ...editing, weight: parseFloat(e.target.value) })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-white text-xs mb-1 block">Order</label>
                  <input
                    type="number"
                    value={editing.order_index}
                    onChange={(e) => setEditing({ ...editing, order_index: parseInt(e.target.value) })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 border border-zinc-700 text-white font-medium py-2 rounded-xl text-sm hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={() => save(editing.id ? 'update' : 'create', editing)}
                className="flex-1 bg-orange-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-sm transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
