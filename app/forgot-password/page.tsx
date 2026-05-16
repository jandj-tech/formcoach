'use client'

import { useState } from 'react'
import TopNav from '@/components/TopNav'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // Ignore — we show the same confirmation either way.
    }
    setStatus('sent')
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm space-y-6">
          {status === 'sent' ? (
            <div className="text-center space-y-3">
              <div className="text-4xl">📬</div>
              <h1 className="text-2xl font-black text-black">Check your email</h1>
              <p className="text-gray-500 text-sm">
                If <span className="text-orange-500">{email}</span> has an account, we&apos;ve sent a
                password reset link. It expires in 1 hour.
              </p>
              <p className="text-gray-400 text-xs">Don&apos;t see it? Check your spam folder.</p>
              <a href="/login" className="inline-block text-orange-500 hover:underline font-medium text-sm">
                Back to log in
              </a>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <div className="text-4xl">🔑</div>
                <h1 className="text-2xl font-black text-black">Forgot your password?</h1>
                <p className="text-gray-500 text-sm">
                  Enter your email and we&apos;ll send you a link to reset it.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-orange-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {status === 'loading' ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
              <p className="text-center text-sm text-gray-500">
                <a href="/login" className="text-orange-500 hover:underline font-medium">Back to log in</a>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
