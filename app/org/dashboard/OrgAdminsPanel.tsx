'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface OrgAdminItem {
  id: string
  email: string
  name: string | null
  accepted: boolean
}

// Linked full-access admin logins for the organization (lib/org-admins.ts).
// Anyone signed in as the org can add one; only the owner can remove one.
export default function OrgAdminsPanel({
  ownerEmail,
  sessionEmail,
  role,
  admins,
}: {
  ownerEmail: string
  sessionEmail: string
  role: 'owner' | 'admin'
  admins: OrgAdminItem[]
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function invite(resendEmail?: string) {
    const value = (resendEmail ?? email).trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setMsg({ ok: false, text: 'Enter a valid email address.' })
      return
    }
    setBusy(resendEmail ?? 'invite')
    setMsg(null)
    try {
      const res = await fetch('/api/org/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, name: resendEmail ? undefined : name.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ ok: false, text: data.error || 'Could not add that admin' })
      } else {
        setMsg({
          ok: true,
          text: data.emailed
            ? `${data.resent ? 'Invite re-sent' : 'Invite sent'} to ${value}. They set a password from the link and then sign in with their own email.`
            : `${value} is linked, but the invite email could not be sent. Try “Resend” in a moment.`,
        })
        if (!resendEmail) { setEmail(''); setName('') }
        router.refresh()
      }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' })
    }
    setBusy(null)
  }

  async function remove(admin: OrgAdminItem) {
    if (!window.confirm(`Remove ${admin.email} as an organization admin? They will be signed out immediately.`)) return
    setBusy(admin.id)
    setMsg(null)
    try {
      const res = await fetch('/api/org/admins', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: admin.id }),
      })
      const data = await res.json()
      if (!res.ok) setMsg({ ok: false, text: data.error || 'Could not remove that admin' })
      else { setMsg({ ok: true, text: `${admin.email} removed.` }); router.refresh() }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' })
    }
    setBusy(null)
  }

  const inputCls = 'w-full bg-white dark:bg-ink-900 border border-gray-300 dark:border-courtline rounded-lg px-3 py-2 text-black dark:text-chalk text-sm placeholder-gray-400 focus:outline-none focus:border-ember-500 transition-colors'

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-chalk-dim">
        An organization admin signs in with their own email and password and can do everything you can here:
        open every team, send tokens, email results and change settings. A <span className="font-semibold">coach</span> only
        sees the one team they coach. Add coaches from a team&rsquo;s card on the Teams tab.
      </p>

      <ul className="divide-y divide-gray-200 dark:divide-courtline border border-gray-200 dark:border-courtline rounded-xl">
        <li className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-black dark:text-chalk truncate">{ownerEmail}</p>
            <p className="text-xs text-gray-500 dark:text-chalk-dim">Owner{ownerEmail.toLowerCase() === sessionEmail.toLowerCase() ? ' · you' : ''}</p>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wide text-ember-600 dark:text-ember-400 shrink-0">Owner</span>
        </li>
        {admins.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black dark:text-chalk truncate">{a.name ? `${a.name} · ${a.email}` : a.email}</p>
              <p className="text-xs text-gray-500 dark:text-chalk-dim">
                {a.accepted ? 'Admin' : 'Invite pending — they haven’t set a password yet'}
                {a.email.toLowerCase() === sessionEmail.toLowerCase() ? ' · you' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!a.accepted && (
                <button
                  type="button"
                  onClick={() => invite(a.email)}
                  disabled={busy !== null}
                  className="text-xs font-semibold text-ember-600 dark:text-ember-400 hover:underline disabled:opacity-50"
                >
                  {busy === a.email ? 'Sending…' : 'Resend'}
                </button>
              )}
              {role === 'owner' && (
                <button
                  type="button"
                  onClick={() => remove(a)}
                  disabled={busy !== null}
                  className="text-xs font-semibold text-gray-500 dark:text-chalk-dim hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                >
                  {busy === a.id ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-black dark:text-chalk">Add an organization admin</p>
        <input type="email" aria-label="Admin email" placeholder="Their email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        <input type="text" aria-label="Admin name (optional)" placeholder="Their name (optional)" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <button
          type="button"
          onClick={() => invite()}
          disabled={busy !== null}
          className="bg-ember-500 hover:bg-ember-400 disabled:bg-ember-300 text-ink-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {busy === 'invite' ? 'Sending…' : 'Email the invite'}
        </button>
        <p className="text-[11px] text-gray-400 dark:text-chalk-dim">
          They get a link to choose their own password. {role === 'owner' ? 'Only you, as the owner, can remove an admin.' : 'Only the organization owner can remove an admin.'}
        </p>
      </div>

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`text-sm font-medium ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</p>
      )}
    </div>
  )
}
