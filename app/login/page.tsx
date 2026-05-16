'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import PasswordInput from '@/components/PasswordInput'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(({ user }) => { if (user) router.replace(next) })
      .catch(() => {})
  }, [router, next])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        setStatus('error')
        return
      }

      router.push(next)
    } catch {
      setError('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="text-4xl">🏀</div>
            <h1 className="text-2xl font-black text-black">Log in to LearnHoops</h1>
            <p className="text-gray-500 text-sm">View your shot history and progress</p>
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
            <PasswordInput
              required
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {status === 'loading' ? 'Logging in...' : 'Log In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <a href={`/signup?next=${encodeURIComponent(next)}`} className="text-orange-500 hover:underline font-medium">Sign up</a>
          </p>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-5xl animate-bounce">🏀</div>
        </div>
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
