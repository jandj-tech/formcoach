'use client'

import { useState } from 'react'
import Image from 'next/image'
import { use } from 'react'

export default function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/submit-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), submissionId: id }),
      })

      if (!res.ok) throw new Error('Failed')
      setStatus('sent')
    } catch {
      setStatus('error')
      setError('Something went wrong. Please try again.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 flex flex-col">
      <nav className="flex items-center px-4 border-b border-slate-800">
        <Image src="/logo.png" alt="FormCoach" width={1024} height={1024} style={{ height: '160px', width: 'auto' }} />
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">
          {status === 'sent' ? (
            <div className="text-center space-y-4">
              <div className="text-6xl">📬</div>
              <h2 className="text-2xl font-bold text-white">Check your inbox!</h2>
              <p className="text-slate-400 leading-relaxed">
                We sent your private results link to <span className="text-orange-400">{email}</span>.
                Click the link in the email to view your full shot breakdown.
              </p>
              <p className="text-slate-500 text-sm">
                Don&apos;t see it? Check your spam folder.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="text-5xl">🏀</div>
                <h1 className="text-3xl font-black text-white">Your analysis is ready!</h1>
                <p className="text-slate-400 leading-relaxed">
                  We&apos;ve scored your shot across all criteria. Enter your email and we&apos;ll
                  send you a private link to your full breakdown.
                </p>
              </div>

              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-2">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="text-green-400">✓</span> Overall shot score
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="text-green-400">✓</span> Score for each of 18 criteria
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="text-green-400">✓</span> AI coaching notes per criterion
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="text-green-400">✓</span> Frame-by-frame thumbnails
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
                />
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/50 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {status === 'loading' ? 'Sending...' : 'Send Me My Results →'}
                </button>
              </form>

              <p className="text-slate-500 text-xs text-center">
                No spam. We&apos;ll also send a few tips on improving your game.
                Unsubscribe anytime.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
