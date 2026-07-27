'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopNav from '@/components/TopNav'
import PasswordInput from '@/components/PasswordInput'

function ResetPasswordForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not reset your password')
        setStatus('error')
        return
      }
      // Coaches and orgs land on their own dashboard; players go to /dashboard.
      router.push(data.redirect || '/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <main className="min-h-screen bg-ink-950 text-chalk flex flex-col">
      <TopNav />
      <div className="hero-glow grain relative flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="text-4xl select-none">🔑</div>
            <h1 className="font-display font-black uppercase text-2xl leading-tight">Set a new password</h1>
            <p className="text-chalk-dim text-sm">Choose a new password for your account.</p>
          </div>

          {!token ? (
            <p className="text-red-400 text-sm text-center">
              This reset link is missing its token. Request a new one from the{' '}
              <a href="/forgot-password" className="text-ember-400 hover:text-ember-500 transition-colors">forgot password</a> page.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 bg-ink-900 border border-courtline rounded-2xl p-5">
              <PasswordInput
                required
                minLength={6}
                name="new-password"
                autoComplete="new-password"
                aria-label="New password"
                placeholder="New password (6+ characters)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-ink-800 border border-courtline rounded-xl pl-4 pr-11 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
              />
              <PasswordInput
                required
                name="confirm-password"
                autoComplete="new-password"
                aria-label="Confirm new password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="w-full bg-ink-800 border border-courtline rounded-xl pl-4 pr-11 py-3 text-chalk placeholder-chalk-dim focus:outline-none focus:border-ember-500 transition-colors"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-ember-500 hover:bg-ember-600 disabled:opacity-50 active:scale-[0.99] text-white font-bold py-3.5 rounded-full transition-all"
              >
                {status === 'loading' ? 'Resetting...' : 'Reset password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
