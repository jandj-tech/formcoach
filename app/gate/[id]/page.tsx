'use client'

import { useState } from 'react'
import { use } from 'react'
import TopNav from '@/components/TopNav'

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
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />

      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">
          {status === 'sent' ? (
            <div className="text-center space-y-4">
              <div className="text-6xl">📬</div>
              <h2 className="text-2xl font-bold text-gray-900">Check your inbox!</h2>
              <p className="text-gray-500 leading-relaxed">
                We sent your private results link to <span className="text-orange-500">{email}</span>.
                Click the link in the email to view your full shot breakdown.
              </p>
              <p className="text-gray-400 text-sm">
                Don&apos;t see it? Check your spam folder.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="text-5xl">🏀</div>
                <h1 className="text-3xl font-black text-gray-900">Your analysis is ready!</h1>
                <p className="text-gray-500 leading-relaxed">
                  We&apos;ve scored your shot across all criteria. Enter your email and we&apos;ll
                  send you a private link to your full breakdown.
                </p>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-2">
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="text-green-500">✓</span> Overall shot score
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="text-green-500">✓</span> Score for each of 18 criteria
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="text-green-500">✓</span> AI coaching notes per criterion
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <span className="text-green-500">✓</span> Frame-by-frame thumbnails
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {status === 'loading' ? 'Sending...' : 'Send Me My Results →'}
                </button>
              </form>

              <p className="text-gray-400 text-xs text-center">
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
