'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface ChatMessage {
  id: number
  senderUserId: string | null
  senderName: string
  senderRole: 'coach' | 'player'
  body: string
  createdAt: string
  mine: boolean
}

interface ChatState {
  messages: ChatMessage[]
  canPost: boolean
  postBlockedReason: string | null
  chatMode: 'everyone' | 'coach-only'
  isCoach: boolean
  mutedUserIds: string[]
  members: Array<{ id: string; name: string; allowed: boolean }>
  teamName: string
}

const POLL_MS = 5000

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Team chat for the website. Same rules as the app — chats start locked,
// the coach opens posting or grants access per player — with the admin
// controls laid out plainly so coach work is one click.
export default function TeamChatPanel({ teamId, tall = false }: { teamId: string; tall?: boolean }) {
  const [state, setState] = useState<ChatState | null | 'error'>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const lastIdRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const merge = useCallback((fresh: ChatState | null, incremental: boolean) => {
    if (!fresh) return
    setState(prev => {
      if (!incremental || !prev || prev === 'error') {
        lastIdRef.current = fresh.messages.length > 0 ? fresh.messages[fresh.messages.length - 1].id : 0
        return fresh
      }
      const known = new Set(prev.messages.map(m => m.id))
      const newOnes = fresh.messages.filter(m => !known.has(m.id))
      if (newOnes.length > 0) lastIdRef.current = newOnes[newOnes.length - 1].id
      return { ...fresh, messages: [...prev.messages, ...newOnes] }
    })
  }, [])

  const loadFull = useCallback(async () => {
    try {
      const res = await fetch(`/api/team/chat?teamId=${encodeURIComponent(teamId)}`)
      if (!res.ok) { setState('error'); return }
      merge(await res.json(), false)
    } catch { setState('error') }
  }, [teamId, merge])

  useEffect(() => {
    loadFull()
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/team/chat?teamId=${encodeURIComponent(teamId)}&after=${lastIdRef.current}`)
        if (res.ok) merge(await res.json(), true)
      } catch {}
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [teamId, loadFull, merge])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state && state !== 'error' ? state.messages.length : 0])

  async function send() {
    const body = draft.trim()
    if (!body || sending || !state || state === 'error') return
    setSending(true)
    try {
      const res = await fetch('/api/team/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error ?? 'Could not send message')
      } else if (data.message) {
        setDraft('')
        setState(prev => prev && prev !== 'error' ? { ...prev, messages: [...prev.messages, data.message] } : prev)
        lastIdRef.current = data.message.id
      }
    } finally {
      setSending(false)
    }
  }

  async function moderate(action: string, extra: Record<string, unknown> = {}) {
    await fetch('/api/team/chat/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, action, ...extra }),
    }).catch(() => {})
    loadFull()
  }

  async function report(messageId: number) {
    const reason = prompt('Why are you reporting this message? (optional)') ?? ''
    const res = await fetch('/api/team/chat/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, reason }),
    }).catch(() => null)
    alert(res?.ok ? 'Reported — we review reports within 24 hours.' : 'Could not report, please try again.')
  }

  if (state === null) {
    return <p className="text-sm text-gray-400 py-6 text-center">Loading chat…</p>
  }
  if (state === 'error') {
    return <p className="text-sm text-gray-400 py-6 text-center">Chat isn&apos;t available right now.</p>
  }

  return (
    <div className="space-y-3">
      {/* Coach admin strip — everything one click, always visible */}
      {state.isCoach && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-bold text-black">Who can send messages</p>
            <div className="inline-flex rounded-lg border border-orange-300 overflow-hidden">
              <button
                onClick={() => moderate('mode', { mode: 'coach-only' })}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${state.chatMode === 'coach-only' ? 'bg-orange-500 text-ink-950' : 'bg-white text-gray-600 hover:bg-orange-100'}`}
              >
                🔒 Coach + allowed
              </button>
              <button
                onClick={() => moderate('mode', { mode: 'everyone' })}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${state.chatMode === 'everyone' ? 'bg-orange-500 text-ink-950' : 'bg-white text-gray-600 hover:bg-orange-100'}`}
              >
                🟢 Everyone
              </button>
            </div>
          </div>

          {state.chatMode === 'coach-only' && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Tick a player to let them send messages:</p>
              {state.members.length === 0 ? (
                <p className="text-xs text-gray-400">No players have joined yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {state.members.map(m => (
                    <label
                      key={m.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold cursor-pointer transition-colors ${m.allowed ? 'bg-orange-500 border-orange-500 text-ink-950' : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400'}`}
                    >
                      <input
                        type="checkbox"
                        checked={m.allowed}
                        onChange={e => moderate(e.target.checked ? 'allow' : 'disallow', { userId: m.id })}
                        className="sr-only"
                      />
                      {m.allowed ? '✓' : '+'} {m.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className={`${tall ? 'h-[60vh]' : 'h-80'} overflow-y-auto border border-gray-200 rounded-xl bg-white p-4 space-y-2`}>
        {state.messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center pt-24">No messages yet.</p>
        ) : (
          state.messages.map(m => (
            <div key={m.id} className={`group flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${m.mine ? 'text-right' : ''}`}>
                {!m.mine && (
                  <p className={`text-[11px] font-bold mb-0.5 ${m.senderRole === 'coach' ? 'text-orange-600' : 'text-gray-500'}`}>
                    {m.senderName}
                  </p>
                )}
                <div className={`inline-block px-3.5 py-2 rounded-2xl text-left text-sm leading-relaxed ${m.mine ? 'bg-orange-500 text-ink-950' : m.senderRole === 'coach' ? 'bg-orange-50 border border-orange-200 text-black' : 'bg-gray-100 text-black'}`}>
                  {m.body}
                </div>
                <p className="text-[10px] text-gray-300 mt-0.5">
                  {timeLabel(m.createdAt)}
                  {(m.mine || state.isCoach) && (
                    <button onClick={() => moderate('delete', { messageId: m.id })} className="ml-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">delete</button>
                  )}
                  {!m.mine && (
                    <button onClick={() => report(m.id)} className="ml-2 text-gray-300 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity">report</button>
                  )}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      {state.canPost ? (
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Message your team…"
            rows={1}
            maxLength={1000}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-black resize-none focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            className="bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-ink-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          🔒 {state.postBlockedReason}
        </p>
      )}
    </div>
  )
}
