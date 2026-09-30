'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { KeyRoundIcon, LoaderCircleIcon } from 'lucide-react'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import PasswordInput from '@/components/PasswordInput'

function TeamSetupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/team/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Setup failed')
        setStatus('error')
        return
      }

      setStatus('success')
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
            <p className="text-gray-500 dark:text-chalk-dim text-sm">Choose a password to access your team dashboard</p>
            <p className="text-gray-500 dark:text-chalk-dim text-xs">
              Already coach another team on LearnHoops? Use the same password — one password works for all your teams.
            </p>
          </div>

          {!token ? (
            <p className="text-center text-red-600 dark:text-red-400 text-sm font-medium">Invalid setup link.</p>
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
                disabled={status === 'loading' || status === 'success'}
                className="w-full bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold py-3 rounded-xl transition-colors"
              >
                {status === 'loading' || status === 'success' ? 'Setting up…' : 'Set password'}
              </button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}

export default function TeamSetupPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white dark:bg-ink-950 flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircleIcon className="h-8 w-8 animate-spin text-gray-400 dark:text-chalk-dim" aria-label="Loading" />
        </div>
      </main>
    }>
      <TeamSetupForm />
    </Suspense>
  )
}
