'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import Link from 'next/link'

type PageState = 'loading' | 'email-form' | 'buy-token' | 'sent'

function GateContent({ id }: { id: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [buying, setBuying] = useState(false)

  const tokenPurchased = searchParams.get('token_purchased') === '1'

  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(async ({ user }) => {
        if (user?.subscribed) {
          const res = await fetch('/api/submit-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, submissionId: id }),
          })
          if (res.ok) {
            const tokenRes = await fetch(`/api/submission-token/${id}`)
            if (tokenRes.ok) {
              const { token } = await tokenRes.json()
              router.push(`/results/${token}`)
              return
            }
          }
        }
        setPageState(tokenPurchased ? 'email-form' : 'email-form')
      })
      .catch(() => setPageState('email-form'))
  }, [id, router, tokenPurchased])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/submit-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), submissionId: id }),
      })

      if (res.status === 402) {
        setPageState('buy-token')
        setSubmitting(false)
        return
      }

      if (!res.ok) throw new Error('Failed')
      try { localStorage.setItem('fc_email', email.trim().toLowerCase()) } catch {}
      setPageState('sent')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBuyToken() {
    setBuying(true)
    try {
      const res = await fetch('/api/buy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), submissionId: id }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setBuying(false)
    }
  }

  if (pageState === 'loading') {
    return (
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-5xl animate-bounce">🏀</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <TopNav />

      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">

          {pageState === 'sent' && (
            <div className="text-center space-y-4">
              <div className="text-6xl">📬</div>
              <h2 className="text-2xl font-bold text-black">Check your inbox!</h2>
              <p className="text-black leading-relaxed">
                We sent your private results link to <span className="text-orange-500">{email}</span>.
                Click the link in the email to view your full shot breakdown.
              </p>
              <p className="text-black text-sm">Don&apos;t see it? Check your spam folder.</p>
            </div>
          )}

          {pageState === 'buy-token' && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="text-5xl">🏀</div>
                <h1 className="text-2xl font-black text-black">Get your shot breakdown</h1>
                <p className="text-black leading-relaxed">
                  Your analysis is ready. Buy one token to view your full results — scored across 17 coaching criteria.
                </p>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-black font-black text-3xl">$4.99</p>
                    <p className="text-gray-500 text-sm mt-0.5">1 shot analysis · one-time</p>
                  </div>
                  <div className="text-4xl">📊</div>
                </div>
                <ul className="space-y-1.5 text-sm text-black">
                  <li className="flex items-center gap-2"><span className="text-orange-500">✓</span> Overall shot score</li>
                  <li className="flex items-center gap-2"><span className="text-orange-500">✓</span> 17 criteria scored with AI coaching notes</li>
                  <li className="flex items-center gap-2"><span className="text-orange-500">✓</span> Frame-by-frame breakdown</li>
                </ul>
                <button
                  onClick={handleBuyToken}
                  disabled={buying}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl transition-colors text-base"
                >
                  {buying ? 'Redirecting...' : 'Buy Analysis — $4.99'}
                </button>
              </div>

              <div className="text-center space-y-2">
                <p className="text-gray-500 text-sm font-semibold">Want more analyses?</p>
                <Link
                  href="/shop"
                  className="inline-flex items-center gap-2 bg-black hover:bg-zinc-800 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
                >
                  🏀 Buy the Training Ball — get 10 free analyses
                </Link>
              </div>

              <button
                onClick={() => setPageState('email-form')}
                className="w-full text-gray-400 text-sm hover:text-gray-600 transition-colors"
              >
                ← Use a different email
              </button>
            </div>
          )}

          {pageState === 'email-form' && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="text-5xl">🏀</div>
                <h1 className="text-3xl font-black text-black">
                  {tokenPurchased ? 'Token purchased!' : 'Your analysis is ready!'}
                </h1>
                <p className="text-black leading-relaxed">
                  {tokenPurchased
                    ? 'Enter your email and we\'ll send you a private link to your full shot breakdown.'
                    : 'We\'ve scored your shot across all criteria. Enter your email and we\'ll send you a private link to your full breakdown.'}
                </p>
              </div>

              {!tokenPurchased && (
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 space-y-2">
                  <div className="flex items-center gap-3 text-sm text-black">
                    <span className="text-orange-500">✓</span> Overall shot score
                  </div>
                  <div className="flex items-center gap-3 text-sm text-black">
                    <span className="text-orange-500">✓</span> Score for each of 17 criteria
                  </div>
                  <div className="flex items-center gap-3 text-sm text-black">
                    <span className="text-orange-500">✓</span> AI coaching notes per criterion
                  </div>
                  <div className="flex items-center gap-3 text-sm text-black">
                    <span className="text-orange-500">✓</span> Frame-by-frame thumbnails
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-black placeholder-black focus:outline-none focus:border-orange-500 transition-colors"
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {submitting ? 'Sending...' : 'Send Me My Results →'}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <a href="/login" className="text-orange-500 hover:underline font-medium">Log in</a>
              </p>
            </div>
          )}

        </div>
      </div>
    </main>
  )
}

export default function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-5xl animate-bounce">🏀</div>
        </div>
      </main>
    }>
      <GateContent id={id} />
    </Suspense>
  )
}
