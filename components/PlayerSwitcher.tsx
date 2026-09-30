'use client'

import { useEffect, useRef, useState } from 'react'

interface Player {
  id: string
  firstName: string
}

/**
 * "Switch player" for a shared login (several player accounts in one
 * users.login_group_id). Renders nothing unless the signed-in player has at
 * least one other member in their group. Switching mints a new session for
 * the chosen account (POST /api/auth/switch-player) and reloads onto its
 * dashboard, so no page keeps the previous player's data on screen.
 */
export default function PlayerSwitcher() {
  const [players, setPlayers] = useState<Player[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/switch-player')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data || !Array.isArray(data.players)) return
        setPlayers(data.players)
        setCurrentId(typeof data.currentId === 'string' ? data.currentId : null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = players.find(p => p.id === currentId)
  const others = players.filter(p => p.id !== currentId)
  if (!current || others.length === 0) return null

  async function switchTo(playerId: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth/switch-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not switch player')
        setBusy(false)
        return
      }
      window.location.assign('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 rounded-full border border-courtline text-sm font-semibold text-chalk hover:border-ember-500/60 transition-colors"
      >
        <span className="max-w-[5rem] sm:max-w-[8rem] truncate">{current.firstName}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-chalk-dim">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-ink-900 border border-courtline rounded-xl shadow-xl p-2 z-50"
        >
          <p className="px-3 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-chalk-dim">Switch player</p>
          {others.map(p => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => switchTo(p.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-chalk hover:bg-ink-800 disabled:opacity-60 transition-colors"
            >
              {p.firstName}
            </button>
          ))}
          {error && <p role="alert" className="px-3 pt-2 text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
