'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { KeyRoundIcon } from 'lucide-react'
import TopNav from '@/components/TopNav'
import WebOnlySignup from '@/components/WebOnlySignup'
import { useIsInApp } from '@/lib/useIsInApp'
import SiteFooter from '@/components/SiteFooter'
import PasswordInput from '@/components/PasswordInput'

function CoachSignupForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  // Checked on load (read-only): a used or expired link says so up front.
  const [linkDead, setLinkDead] = useState(false)
  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch(`/api/team/coach-signup?token=${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.valid === false) setLinkDead(true) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/team/coach-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Signup failed')
        if (res.status === 404) setLinkDead(true)
        setStatus('error')
        return
      }
      router.push('/team/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ember-50 dark:bg-ember-500/10 text-ember-600 dark:text-ember-400">
              <KeyRoundIcon className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-chalk">Set up your coach account</h1>
            <p className="text-gray-500 dark:text-chalk-dim text-sm">Create a password to access your team dashboard.</p>
            <p className="text-gray-500 dark:text-chalk-dim text-xs">
              Already coach another team on LearnHoops? Use the same password — one password works for all your teams.
            </p>
          </div>

          {token && linkDead ? (
            <div className="rounded-xl border border-gray-200 dark:border-courtline bg-gray-50 dark:bg-ink-900 p-4 text-sm text-gray-600 dark:text-chalk-dim text-center space-y-2">
              <p className="font-semibold text-gray-900 dark:text-chalk">This setup link has already been used or has expired.</p>
              <p>
                Already set your password?{' '}
                <a href="/team/login" className="font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500">Log in</a>.
                {' '}Otherwise ask whoever invited you to send a new invite, or{' '}
                <a href="/forgot-password" className="font-semibold text-ember-600 dark:text-ember-400 hover:text-ember-500">reset your password</a>.
              </p>
            </div>
          ) : !token ? (
            <p className="text-red-600 dark:text-red-400 text-sm text-center">This signup link is missing its token.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <PasswordInput
                required
                minLength={6}
                placeholder="Password (6+ characters)"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <PasswordInput
                required
                placeholder="Confirm password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
              {error && <p role="alert" className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold py-3 rounded-xl transition-colors"
              >
                {status === 'loading' ? 'Creating account…' : 'Create coach account'}
              </button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}

export default function CoachSignupPage() {
  // Coach and organization accounts are created on the website only —
  // they are billed surfaces with rosters and invoices behind them.
  const inApp = useIsInApp()
  if (inApp) return <WebOnlySignup kind="coach" />

  return (
    <Suspense>
      <CoachSignupForm />
    </Suspense>
  )
}
