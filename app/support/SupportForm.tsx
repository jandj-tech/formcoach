'use client'

import { useState } from 'react'

// Topic slugs must stay in sync with the TOPICS map in app/api/support/route.ts.
const TOPICS = [
  ['account', 'Account & login'],
  ['analysis', 'Shot analysis results'],
  ['orders', 'Orders & shipping'],
  ['billing', 'Credits, tokens & billing'],
  ['teams', 'Teams & organizations'],
  ['report', 'Report inappropriate content'],
  ['other', 'Something else'],
] as const

const inputClass =
  'w-full bg-ink-800 border border-courtline rounded-xl px-3 py-2.5 text-sm text-chalk placeholder:text-gray-500 focus:outline-none focus:border-ember-500 transition-colors'

export default function SupportForm() {
  const [topic, setTopic] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  // Honeypot — hidden from real visitors, bots tend to fill it.
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, name, email, message, website }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setBusy(false)
        return
      }
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  if (sent) {
    return (
      <div className="bg-ink-900 border border-courtline rounded-2xl p-6 space-y-2 text-center">
        <p className="text-2xl" aria-hidden>✓</p>
        <p className="font-bold text-chalk">Message sent</p>
        <p className="text-sm text-chalk-dim">
          Thanks — we&apos;ll get back to you at <span className="text-chalk font-semibold">{email}</span>, usually within 24 hours.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-ink-900 border border-courtline rounded-2xl p-6 space-y-4 text-left">
      <p className="eyebrow text-chalk-dim select-none text-center">Contact us</p>

      <div className="space-y-1">
        <label htmlFor="support-topic" className="text-xs font-bold text-chalk-dim uppercase tracking-wide">
          What do you need help with?
        </label>
        <select
          id="support-topic"
          required
          value={topic}
          onChange={e => setTopic(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>Choose a topic…</option>
          {TOPICS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="support-name" className="text-xs font-bold text-chalk-dim uppercase tracking-wide">
            Your name
          </label>
          <input
            id="support-name"
            required
            maxLength={100}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jordan S."
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="support-email" className="text-xs font-bold text-chalk-dim uppercase tracking-wide">
            Your email
          </label>
          <input
            id="support-email"
            type="email"
            required
            maxLength={255}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="support-message" className="text-xs font-bold text-chalk-dim uppercase tracking-wide">
          How can we help?
        </label>
        <textarea
          id="support-message"
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Tell us what's going on — include order numbers or links if you have them."
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* Honeypot: real visitors never see or fill this. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="support-website">Website</label>
        <input
          id="support-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={e => setWebsite(e.target.value)}
        />
      </div>

      {error && <p className="text-sm font-semibold text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-ember-500 hover:bg-ember-400 disabled:opacity-60 text-ink-950 font-bold py-3 rounded-full transition-colors"
      >
        {busy ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
