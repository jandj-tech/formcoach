'use client'

import { useState, useEffect } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import TopNav from '@/components/TopNav'

type PageState = 'loading' | 'email-form' | 'upgrade' | 'sent'

export default function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [subscribing, setSubscribing] = useState(false)
  const [upgradePlan, setUpgradePlan] = useState<'monthly' | 'annual'>('annual')
  const [upgradeCountry, setUpgradeCountry] = useState<'US' | 'CA'>('US')

  // Check if user is already logged in with active subscription
  useEffect(() => {
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(async ({ user }) => {
        if (user?.subscribed) {
          // Auto-submit their email and redirect to results
          const res = await fetch('/api/submit-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, submissionId: id }),
          })
          if (res.ok) {
            // Get token to redirect directly
            const tokenRes = await fetch(`/api/submission-token/${id}`)
            if (tokenRes.ok) {
              const { token } = await tokenRes.json()
              router.push(`/results/${token}`)
              return
            }
          }
        }
        setPageState('email-form')
      })
      .catch(() => setPageState('email-form'))
  }, [id, router])

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

      if (res.status === 429) {
        setPageState('upgrade')
        setSubmitting(false)
        return
      }

      if (!res.ok) throw new Error('Failed')
      // Remember email so analyze page can show remaining upload count
      try { localStorage.setItem('fc_email', email.trim().toLowerCase()) } catch {}
      setPageState('sent')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubscribe() {
    setSubscribing(true)
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: upgradePlan, country: upgradeCountry, submissionId: id }),
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch {
      setSubscribing(false)
    }
  }

  const PRICES = {
    monthly: { US: '$2.49/mo', CA: '$3.49/mo CAD' },
    annual:  { US: '$11.99/yr', CA: '$16.99/yr CAD' },
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

          {pageState === 'upgrade' && (
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="text-5xl">🔒</div>
                <h1 className="text-2xl font-black text-black">You&apos;ve used your 3 free analyses this month</h1>
                <p className="text-black leading-relaxed">
                  Upgrade to keep getting unlimited feedback on your shot — your analysis is ready and waiting.
                </p>
              </div>

              {/* Plan toggle */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase">Plan</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setUpgradePlan('monthly')}
                    className={`py-3 px-4 rounded-xl border-2 text-sm font-bold transition-colors ${
                      upgradePlan === 'monthly' ? 'border-orange-500 bg-orange-50 text-black' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    Monthly
                    <span className="block text-xs font-normal mt-0.5">{PRICES.monthly[upgradeCountry]}</span>
                  </button>
                  <button
                    onClick={() => setUpgradePlan('annual')}
                    className={`py-3 px-4 rounded-xl border-2 text-sm font-bold transition-colors relative ${
                      upgradePlan === 'annual' ? 'border-orange-500 bg-orange-50 text-black' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <span className="absolute -top-2 right-2 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">BEST VALUE</span>
                    Yearly
                    <span className="block text-xs font-normal mt-0.5">{PRICES.annual[upgradeCountry]}</span>
                  </button>
                </div>
              </div>

              {/* Country toggle */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 tracking-wider uppercase">Location</p>
                <div className="inline-flex rounded-lg p-1 gap-1 border border-gray-200 bg-white">
                  <button
                    onClick={() => setUpgradeCountry('US')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                      upgradeCountry === 'US' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-black'
                    }`}
                  >
                    🇺🇸 USA
                  </button>
                  <button
                    onClick={() => setUpgradeCountry('CA')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                      upgradeCountry === 'CA' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-black'
                    }`}
                  >
                    🇨🇦 Canada
                  </button>
                </div>
              </div>

              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl transition-colors"
              >
                {subscribing ? 'Redirecting...' : `Subscribe — ${PRICES[upgradePlan][upgradeCountry]}`}
              </button>

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
                <h1 className="text-3xl font-black text-black">Your analysis is ready!</h1>
                <p className="text-black leading-relaxed">
                  We&apos;ve scored your shot across all criteria. Enter your email and we&apos;ll
                  send you a private link to your full breakdown.
                </p>
              </div>

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

              <p className="text-black text-xs text-center">
                Free: 3 analyses per month. No spam. Unsubscribe anytime.
              </p>

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
