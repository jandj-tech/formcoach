'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import TopNav from '@/components/TopNav'
import SiteFooter from '@/components/SiteFooter'
import Image from 'next/image'
import PasswordInput from '@/components/PasswordInput'
import { safeLocalPath } from '@/lib/safe-next'

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  // From a free-membership confirm link, when the clicker must take control of
  // the account (see app/api/auth/confirm-email).
  const activate = params.get('activate') === '1'
  // Coach/org-added player finishing setup from the emailed link.
  const setup = params.get('setup') === '1'
  // Carried from a link bound to one account (confirm / setup link) so a comp
  // on a shared family email lands on that account in this one step.
  const chosen = params.get('chosen') || ''
  // Where a player lands once the password is set (a "finish setup to see your
  // results" link carries their results). Same-site paths only.
  const next = safeLocalPath(params.get('next'))
  // Several players can share a family email: name the one this link is for.
  const [playerName, setPlayerName] = useState('')
  // A coach/org-added player finishing setup: "Uma V." (read-only check).
  const [setupName, setSetupName] = useState('')
  // The link was already used (account set up) or has run out. Checked on
  // load (read-only — nothing is consumed), and again on submit.
  const [linkDead, setLinkDead] = useState(false)
  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return
        if (d.valid === false) { setLinkDead(true); return }
        if (d.valid && typeof d.firstName === 'string') setPlayerName(d.firstName)
        if (d.valid && d.rosterSetup && typeof d.setupName === 'string') setSetupName(d.setupName)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [token])
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
        body: JSON.stringify({ token, password, ...(chosen ? { chosen } : {}), ...(next ? { next } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not reset your password')
        if (res.status === 400 && !data.code && /invalid or has expired/i.test(data.error || '')) setLinkDead(true)
        setStatus('error')
        return
      }
      // Coaches and orgs land on their own dashboard; players go to /dashboard.
      const dest = data.redirect || '/dashboard'
      router.push(activate && dest === '/dashboard' ? '/dashboard?activated=1' : dest)
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
            <Image src="/icon.png" alt="" width={48} height={48} className="mx-auto rounded-2xl select-none" aria-hidden />
            <h1 className="font-display font-black uppercase text-2xl leading-tight">
              {activate
                ? 'Activate your free membership'
                : linkDead
                  ? setup ? 'This setup link has been used or expired' : 'This reset link has expired'
                : setupName
                  ? `Finish setting up ${setupName}’s account`
                : playerName
                  ? setup ? `Set ${playerName}’s password` : `Reset ${playerName}’s password`
                  : 'Set a new password'}
            </h1>
            <p className="text-chalk-dim text-sm">
              {activate
                ? 'Someone may have created this account with your email. Set your password to take control and activate your free membership.'
                : linkDead
                  ? null
                : setupName
                  ? playerName
                    ? `Choose a password for ${setupName}. Each player on a family email has their own.`
                    : 'Choose a password to see your shot results. It’s free and takes under a minute.'
                : playerName
                  ? setup
                    ? `Each player on a family email has their own password. This one is for ${playerName}.`
                    : `This changes ${playerName}’s password only. Each player on a family email has their own.`
                  : 'Choose a new password for your account.'}
            </p>
          </div>

          {token && linkDead ? (
            <div className="bg-ink-900 border border-courtline rounded-2xl p-5 text-sm text-chalk-dim text-center space-y-3">
              {setup ? (
                <p>
                  This link has already been used or has expired. Already set a password?{' '}
                  <a href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-ember-400 hover:text-ember-500 font-semibold transition-colors">Log in</a>
                  {' '}to see your results. Otherwise{' '}
                  <a href="/forgot-password" className="text-ember-400 hover:text-ember-500 font-semibold transition-colors">get a new link</a>.
                </p>
              ) : (
                <p>
                  This reset link is invalid or has expired.{' '}
                  <a href="/forgot-password" className="text-ember-400 hover:text-ember-500 font-semibold transition-colors">Request a new one</a>
                  {' '}or{' '}
                  <a href="/login" className="text-ember-400 hover:text-ember-500 font-semibold transition-colors">log in</a>.
                </p>
              )}
            </div>
          ) : !token ? (
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
              {error && (
                <p className="text-red-400 text-sm">
                  {linkDead && setup ? (
                    <>
                      This setup link has already been used or has expired. Already set a password?{' '}
                      <a href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-ember-400 hover:text-ember-500 font-semibold transition-colors">Log in</a>
                      {' '}to see your results. Otherwise{' '}
                      <a href="/forgot-password" className="text-ember-400 hover:text-ember-500 font-semibold transition-colors">get a new link</a>.
                    </>
                  ) : (
                    error
                  )}
                </p>
              )}
              <button
                type="submit"
                disabled={status === 'loading'}
                className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-50 active:scale-[0.99] text-ink-950 font-bold py-3.5 rounded-full transition-all"
              >
                {status === 'loading'
                  ? activate ? 'Activating...' : setup ? 'Saving...' : 'Resetting...'
                  : activate ? 'Set password and activate' : setup ? 'Set password' : 'Reset password'}
              </button>
            </form>
          )}
        </div>
      </div>
      <SiteFooter />
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
