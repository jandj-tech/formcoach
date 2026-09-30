'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, KeyRound, Link2, Loader2, Mail, Unlink, UserRound, Users } from 'lucide-react'
import Section from '@/components/account/Section'
import PasswordInput from '@/components/PasswordInput'

// Settings → Family. Renders nothing unless other player accounts share this
// account's email. Sharing a login is opt-in: most siblings keep their own
// password. Rules live in lib/account-family.ts.

interface Member {
  id: string
  firstName: string
  shared: boolean
  setupComplete: boolean
}
interface FamilyView {
  me: string
  inGroup: boolean
  accounts: Member[]
}

const field =
  'w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-xl pl-4 pr-11 py-2.5 text-sm text-black dark:text-chalk placeholder-gray-400 dark:placeholder-chalk-dim focus:outline-none focus:border-orange-500 transition-colors'
const primaryBtn =
  'inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-ink-950 font-bold px-4 py-2.5 rounded-xl text-sm transition-colors'
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-courtline hover:bg-gray-50 dark:hover:bg-ink-800 text-black dark:text-chalk font-semibold px-4 py-2 rounded-xl text-sm transition-colors'

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: { error?: string; sharedWith?: string } }> {
  const res = await fetch('/api/account/family', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

export default function FamilySettings() {
  const router = useRouter()
  const [view, setView] = useState<FamilyView | null>(null)
  const [sharing, setSharing] = useState<Member | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/family', { cache: 'no-store' })
      if (res.ok) setView(await res.json())
    } catch {
      // Leave the card hidden; nothing else on the page depends on it.
    }
  }, [])

  useEffect(() => {
    // Fetch-on-mount: the card is client-only so the page needs no extra props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  if (!view || view.accounts.length === 0) return null

  const sharedWith = view.accounts.filter((a) => a.shared).map((a) => a.firstName)
  const summary = sharedWith.length ? `Shared with ${names(sharedWith)}` : `${view.accounts.length} other player${view.accounts.length === 1 ? '' : 's'}`

  async function done(message: string) {
    setSharing(null)
    setNotice(message)
    await load()
    router.refresh()
  }

  return (
    <Section
      title="Family"
      tipLabel="What is Family?"
      tip="Other player accounts that use your email. Each player has their own account, shots and tokens. You can choose to share one login between them."
      summary={summary}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-chalk-dim">
          These players use the same email as you. Each one has a separate account with their own shots, tokens and
          memberships.
        </p>

        <ul className="divide-y divide-gray-100 dark:divide-courtline border border-gray-200 dark:border-courtline rounded-xl">
          {view.accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 shrink-0 rounded-full bg-gray-100 dark:bg-ink-800 flex items-center justify-center text-gray-500 dark:text-chalk-dim">
                  <UserRound className="w-4 h-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-black dark:text-chalk truncate">{a.firstName}</span>
                  <span className="block text-xs text-gray-500 dark:text-chalk-dim">
                    {a.shared ? 'Shares your login' : a.setupComplete ? 'Separate login' : 'Account setup not finished'}
                  </span>
                </span>
              </span>
              {a.shared ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-400">
                  <Check className="w-4 h-4" aria-hidden /> Shared
                </span>
              ) : a.setupComplete ? (
                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => {
                    setNotice(null)
                    setSharing(sharing?.id === a.id ? null : a)
                  }}
                  aria-expanded={sharing?.id === a.id}
                >
                  <Link2 className="w-4 h-4" aria-hidden /> Share a login with {a.firstName}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {sharing && <SharePanel key={sharing.id} me={view.me} other={sharing} onDone={done} onCancel={() => setSharing(null)} />}

        {notice && (
          <p role="status" className="flex items-start gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
            <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> {notice}
          </p>
        )}

        {view.inGroup && <StopSharing sharedWith={names(sharedWith)} plural={sharedWith.length > 1} onDone={done} />}
      </div>
    </Section>
  )
}

function SharePanel({
  me,
  other,
  onDone,
  onCancel,
}: {
  me: string
  other: Member
  onDone: (message: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [method, setMethod] = useState<'password' | 'inbox'>('password')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = other.firstName

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { ok, data } = await post({
      action: method === 'password' ? 'share' : 'share-by-inbox',
      withUserId: other.id,
      password,
    })
    setBusy(false)
    if (!ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
      return
    }
    setPassword('')
    await onDone(
      method === 'password'
        ? `You now share a login with ${name}. Use ${name}'s password to sign in, then pick the player.`
        : `We emailed a confirmation link to your inbox. Once it's confirmed, your password opens ${name}'s account too.`,
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl bg-gray-50 dark:bg-ink-800 border border-gray-200 dark:border-courtline p-4 space-y-4">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-bold text-black dark:text-chalk">
          <Users className="w-4 h-4" aria-hidden /> Share a login with {name}
        </h4>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-chalk-dim list-disc pl-5">
          <li>One password opens both accounts.</li>
          <li>You&rsquo;ll pick the player after signing in.</li>
          <li>Shots, tokens and memberships stay on each player&rsquo;s own account.</li>
          <li>You can stop sharing any time.</li>
        </ul>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide mb-1">How to confirm</legend>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="family-method"
            className="mt-1 accent-orange-500"
            checked={method === 'password'}
            onChange={() => { setMethod('password'); setPassword(''); setError(null) }}
          />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-black dark:text-chalk"><KeyRound className="w-4 h-4" aria-hidden /> I know {name}&rsquo;s password</span>
            <span className="block text-gray-500 dark:text-chalk-dim">Your password changes to {name}&rsquo;s.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="family-method"
            className="mt-1 accent-orange-500"
            checked={method === 'inbox'}
            onChange={() => { setMethod('inbox'); setPassword(''); setError(null) }}
          />
          <span className="text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-black dark:text-chalk"><Mail className="w-4 h-4" aria-hidden /> Email a confirmation link</span>
            <span className="block text-gray-500 dark:text-chalk-dim">
              We send a link to your email. Once it&rsquo;s confirmed, {name}&rsquo;s password changes to yours.
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <label htmlFor="family-password" className="block text-sm font-semibold text-black dark:text-chalk mb-1">
          {method === 'password' ? `${name}'s password` : `Your password (${me})`}
        </label>
        <PasswordInput
          id="family-password"
          autoComplete={method === 'password' ? 'off' : 'current-password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !password} className={primaryBtn}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {method === 'password' ? 'Share login' : 'Send link'}
        </button>
        <button type="button" onClick={onCancel} className={secondaryBtn}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function StopSharing({ sharedWith, plural, onDone }: { sharedWith: string; plural: boolean; onDone: (message: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pw !== pw2) {
      setError('The two passwords don’t match.')
      return
    }
    setBusy(true)
    setError(null)
    const { ok, data } = await post({ action: 'stop-sharing', newPassword: pw })
    setBusy(false)
    if (!ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
      return
    }
    setPw('')
    setPw2('')
    setOpen(false)
    await onDone('You have your own login again. Sign in with your new password from now on.')
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-sm text-gray-600 dark:text-chalk-dim">You share one password with {sharedWith}.</p>
        <button type="button" onClick={() => { setOpen(true); setError(null) }} className={secondaryBtn}>
          <Unlink className="w-4 h-4" aria-hidden /> Stop sharing
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 dark:border-courtline p-4 space-y-3">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-bold text-black dark:text-chalk">
          <Unlink className="w-4 h-4" aria-hidden /> Stop sharing
        </h4>
        <p className="mt-1 text-sm text-gray-600 dark:text-chalk-dim">
          Choose a new password for your account. It must be different from the shared one. {sharedWith} {plural ? 'keep' : 'keeps'} the
          shared password. Nothing moves between accounts.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="family-new-pw" className="block text-sm font-semibold text-black dark:text-chalk mb-1">New password</label>
          <PasswordInput id="family-new-pw" autoComplete="new-password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="family-new-pw2" className="block text-sm font-semibold text-black dark:text-chalk mb-1">Confirm new password</label>
          <PasswordInput id="family-new-pw2" autoComplete="new-password" minLength={6} required value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || pw.length < 6} className={primaryBtn}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          Stop sharing
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryBtn}>
          Cancel
        </button>
      </div>
    </form>
  )
}
