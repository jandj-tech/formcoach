'use client'

import { useState } from 'react'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import Image from 'next/image'

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
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          {status === 'sent' ? (
            <div className="text-center space-y-3">
              <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
              <h1 className="font-display font-black uppercase text-2xl leading-tight">Check your email</h1>
              <p className="text-chalk-dim text-sm">
                If <span className="text-ember-400">{email}</span> has an account, we&apos;ve sent a
                password reset link. It expires in 1 hour.
              </p>
              <p className="text-chalk-dim text-xs">Don&apos;t see it? Check your spam folder.</p>
              <a href="/login" className="inline-block text-ember-400 hover:text-ember-500 font-medium text-sm transition-colors py-1">
                Back to log in
              </a>
            </div>
          ) : (
            <>
              <div className="text-center space-y-3">
                <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
                <h1 className="font-display font-black uppercase text-2xl leading-tight">Forgot your password?</h1>
                <p className="text-chalk-dim text-sm">
                  Enter your email and we&apos;ll send you a link to reset it.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3 bg-ink-900 border border-courtline rounded-2xl p-5">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  aria-label="Email"
                  required
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-ink-800 border border-courtline rounded-xl px-4 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-50 active:scale-[0.99] text-ink-950 font-bold py-3.5 rounded-full transition-all"
                >
                  {status === 'loading' ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
              <p className="text-center text-sm text-chalk-dim">
                <a href="/login" className="text-ember-400 hover:text-ember-500 font-medium transition-colors">Back to log in</a>
              </p>
            </>
          )}
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
