'use client'

import { useState } from 'react'

// Coach announcement blast: type it, hit send, every registered player on
// the team gets it by email. For "practice is canceled tonight" moments.
export default function EmailTeamPanel({ teamId, playerCount }: { teamId?: string; playerCount?: number }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')

  async function send() {
    if (!message.trim()) {
      setResult('Type the message first.')
      return
    }
    if (!confirm(`Email this to every registered player on the team?`)) return
    setSending(true)
    setResult('')
    try {
      const res = await fetch('/api/team/announce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(teamId ? { teamId } : {}), subject: subject.trim(), message: message.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult(data.error ?? 'Could not send — please try again.')
      } else {
        setResult(`✅ Sent to ${data.sent} player${data.sent !== 1 ? 's' : ''}.`)
        setMessage('')
        setSubject('')
      }
    } catch {
      setResult('Could not send — please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-bold text-black">📣 Email your whole team</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Every registered player{typeof playerCount === 'number' ? ` (${playerCount})` : ''} gets this in their inbox right away — for urgent things like a canceled practice. Replies come to your email.
        </p>
      </div>
      <input
        type="text"
        value={subject}
        onChange={e => setSubject(e.target.value)}
        placeholder="Subject (optional — e.g. Practice canceled tonight)"
        maxLength={150}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-black focus:outline-none focus:border-orange-500"
      />
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        placeholder="Type exactly what you want your players to read…"
        rows={5}
        maxLength={5000}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-black resize-y focus:outline-none focus:border-orange-500"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={send}
          disabled={sending || !message.trim()}
          className="bg-orange-500 hover:bg-orange-400 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          {sending ? 'Sending…' : 'Send to Team'}
        </button>
        {result && <p className={`text-sm font-semibold ${result.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{result}</p>}
      </div>
    </div>
  )
}
