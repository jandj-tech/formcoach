'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Lets the logged-in coach set their own display name.
export default function CoachNicknameForm({ current }: { current: string | null }) {
  const router = useRouter()
  const [nickname, setNickname] = useState(current ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    try {
      const res = await fetch('/api/team/coach-nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('saved')
      router.refresh()
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSave} className="border border-gray-200 dark:border-courtline rounded-2xl p-4 space-y-2">
      <p className="text-sm text-gray-600 dark:text-chalk-dim">
        Your coach name — shown to your organization and team so people know who you are.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          maxLength={100}
          aria-label="e.g. Coach Mike"
          placeholder="e.g. Coach Mike"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          className="flex-1 bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl px-4 py-2.5 text-black dark:text-chalk placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
        />
        <button
          type="submit"
          disabled={status === 'saving'}
          className="shrink-0 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {status === 'saved' && <p className="text-green-600 dark:text-green-400 text-sm font-semibold">Saved!</p>}
      {status === 'error' && <p className="text-red-500 text-sm">Could not save. Please try again.</p>}
    </form>
  )
}
