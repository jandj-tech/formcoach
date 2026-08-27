'use client'

import { useState } from 'react'

type Audience = 'all' | 'players' | 'coaches' | 'orgs' | 'single'

const AUDIENCES: Array<{ id: Audience; label: string; hint: string }> = [
  { id: 'all', label: 'Everyone', hint: 'every subscribed address on the list' },
  { id: 'players', label: 'Players', hint: 'subscribed player accounts' },
  { id: 'coaches', label: 'Coaches', hint: 'subscribed team coaches' },
  { id: 'orgs', label: 'Organizations', hint: 'subscribed org admins' },
  { id: 'single', label: 'One address', hint: 'a single email from the list' },
]

// Ready-made email types. Picking one fills the form — everything stays
// editable. {{name}} becomes each recipient's first name ("there" fallback).
type Preset = {
  id: string
  label: string
  subject: string
  headline: string
  body: string
  ctaText: string
  ctaUrl: string
}

const PRESETS: Preset[] = [
  {
    id: 'professional',
    label: 'Professional update',
    subject: 'An update from LearnHoops',
    headline: 'A quick update from the LearnHoops team',
    body: `Hi {{name}},

We wanted to share a quick update on what's new at LearnHoops.

[Write your update here — new features, schedule changes, announcements.]

Thank you for being part of the LearnHoops community. If you have any questions, reply to this email or contact us at learnhoops.com/support.

— The LearnHoops Team`,
    ctaText: '',
    ctaUrl: '',
  },
  {
    id: 'ball',
    label: 'Training Ball',
    subject: 'Train with the ball that fixes your shot',
    headline: 'Meet the LearnHoops Training Ball 🏀',
    body: `Hey {{name}},

The LearnHoops Training Ball has finger-placement guide lines printed right on the surface, so every rep grooves perfect hand position. It comes in right- and left-handed versions and three sizes.

Every ball also includes 5 free AI shot analyses — so you can watch your form improve week after week.`,
    ctaText: 'Shop the Training Ball',
    ctaUrl: 'https://www.learnhoops.com/shop',
  },
  {
    id: 'marketing',
    label: 'Marketing / promo',
    subject: 'Your jump shot, broken down by AI',
    headline: 'Know exactly what to fix in your shot',
    body: `Hey {{name}},

Upload one video of your jump shot and LearnHoops scores it across 18 coaching criteria — release point, elbow alignment, follow-through, and more.

You'll get an overall score, what you're already doing well, and the exact fixes that will add points to your shot.`,
    ctaText: 'Analyze my shot',
    ctaUrl: 'https://www.learnhoops.com/analyze',
  },
  {
    id: 'winback',
    label: 'Win-back',
    subject: 'Your next shot analysis is waiting',
    headline: 'Ready for your next rep, {{name}}?',
    body: `It's been a little while since your last shot analysis. Progress comes from checking in on your form regularly — one video is all it takes.

Upload your latest shot and see how your score has moved.`,
    ctaText: 'Upload a shot',
    ctaUrl: 'https://www.learnhoops.com/analyze',
  },
  {
    id: 'custom',
    label: 'Custom (blank)',
    subject: '',
    headline: '',
    body: '',
    ctaText: '',
    ctaUrl: '',
  },
]

export default function SendEmailPanel() {
  const [open, setOpen] = useState(false)
  const [audience, setAudience] = useState<Audience>('all')
  const [singleEmail, setSingleEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [testEmail, setTestEmail] = useState('')

  const [busy, setBusy] = useState<'preview' | 'test' | 'send' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [presetId, setPresetId] = useState('')
  // Preview returned by the server — shown in a modal before sending.
  const [preview, setPreview] = useState<{ subject: string; html: string; recipientCount: number; sampleName?: string } | null>(null)

  function applyPreset(p: Preset) {
    setPresetId(p.id)
    setSubject(p.subject)
    setHeadline(p.headline)
    setBody(p.body)
    setCtaText(p.ctaText)
    setCtaUrl(p.ctaUrl)
    setError('')
  }

  function payload() {
    return {
      audience,
      singleEmail: singleEmail.trim() || undefined,
      subject, headline, body,
      ctaText: ctaText.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
    }
  }

  async function call(action: 'preview' | 'test' | 'send', extra: Record<string, string> = {}) {
    setBusy(action)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/admin/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload(), ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return null
      }
      return data
    } catch {
      setError('Something went wrong. Please try again.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function handlePreview() {
    const data = await call('preview')
    if (data) setPreview(data)
  }

  async function handleTest() {
    if (!testEmail.trim()) {
      setError('Enter an address to send the test to')
      return
    }
    const data = await call('test', { testEmail: testEmail.trim() })
    if (data) setNotice(`Test sent to ${testEmail.trim()} — check your inbox.`)
  }

  async function handleSend() {
    if (!preview) return
    const n = preview.recipientCount
    if (!confirm(`Send this email to ${n} recipient${n !== 1 ? 's' : ''}? This cannot be undone.`)) return
    const data = await call('send')
    if (data) {
      setPreview(null)
      setNotice(`Sent to ${data.sent} recipient${data.sent !== 1 ? 's' : ''}${data.failed ? ` — ${data.failed} failed (${data.errors?.[0] ?? 'unknown error'})` : ''}.`)
      if (!data.failed) {
        setSubject(''); setHeadline(''); setBody(''); setCtaText(''); setCtaUrl('')
        setOpen(false)
      }
    }
  }

  const inputCls = 'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-orange-500'
  const labelCls = 'text-zinc-300 text-xs font-semibold uppercase tracking-wide'

  return (
    <div className="space-y-3">
      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800 space-y-1">
              <h2 className="text-white font-black text-lg">Preview</h2>
              <p className="text-zinc-400 text-sm">
                Subject: <span className="text-white font-semibold">{preview.subject}</span>
              </p>
              <p className="text-zinc-400 text-sm">
                Will be sent to <span className="text-orange-400 font-bold">{preview.recipientCount}</span> subscribed recipient{preview.recipientCount !== 1 ? 's' : ''} ({AUDIENCES.find(a => a.id === audience)?.label}).
                Each copy is personalized individually and gets its own unsubscribe link
                {preview.sampleName ? <> — this preview shows it as &ldquo;{preview.sampleName}&rdquo; would receive it</> : null}.
              </p>
            </div>
            <div className="flex-1 overflow-auto bg-white">
              <iframe
                srcDoc={preview.html}
                title="Email preview"
                sandbox=""
                className="w-full h-[60vh] border-0"
              />
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex items-center gap-3 flex-wrap">
              <button
                onClick={handleSend}
                disabled={busy !== null || preview.recipientCount === 0}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {busy === 'send' ? 'Sending…' : `Send to ${preview.recipientCount} recipient${preview.recipientCount !== 1 ? 's' : ''}`}
              </button>
              <button
                onClick={() => setPreview(null)}
                disabled={busy !== null}
                className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors"
              >
                Back to editing
              </button>
              {error && <span className="text-red-400 text-sm">{error}</span>}
            </div>
          </div>
        </div>
      )}

      {!open ? (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setOpen(true); setNotice(''); setError('') }}
            className="bg-orange-500 hover:bg-orange-400 text-ink-950 font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            ✉️ Send Email
          </button>
          {notice && <span className="text-green-400 text-sm">{notice}</span>}
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-black text-lg">Send an email</h2>
            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white text-sm transition-colors">
              Close
            </button>
          </div>

          {/* Audience */}
          <div className="space-y-2">
            <span className={labelCls}>To</span>
            <div className="flex gap-2 flex-wrap">
              {AUDIENCES.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAudience(a.id)}
                  title={a.hint}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    audience === a.id
                      ? 'bg-orange-500 text-ink-950'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <p className="text-zinc-500 text-xs">
              {AUDIENCES.find(a => a.id === audience)?.hint}. Unsubscribed addresses are always skipped.
            </p>
            {audience === 'single' && (
              <input
                type="email"
                value={singleEmail}
                onChange={e => setSingleEmail(e.target.value)}
                placeholder="who@example.com"
                className={inputCls}
              />
            )}
          </div>

          {/* Email type presets */}
          <div className="space-y-2">
            <span className={labelCls}>Type of email</span>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    presetId === p.id
                      ? 'bg-orange-500 text-ink-950'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-zinc-500 text-xs">
              Picking a type fills in the email below — edit anything you like. Write{' '}
              <code className="text-orange-400">{'{{name}}'}</code> anywhere and each person gets their
              own first name (or &ldquo;there&rdquo; if we don&rsquo;t know it).
            </p>
          </div>

          {/* Content */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className={labelCls}>Subject line</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. New: 10-Week Shooting Class" className={inputCls} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className={labelCls}>Headline (big text at the top)</label>
              <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="e.g. Something big is coming to LearnHoops" className={inputCls} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className={labelCls}>Message</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={6}
                placeholder={'Write your message here.\n\nLeave a blank line between paragraphs.'}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Button label (optional)</label>
              <input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="e.g. Shop the ball" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Button link (optional)</label>
              <input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="https://learnhoops.com/shop" className={inputCls} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              onClick={handlePreview}
              disabled={busy !== null}
              className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-ink-950 font-bold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {busy === 'preview' ? 'Building preview…' : 'Preview & Send'}
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 w-52"
              />
              <button
                onClick={handleTest}
                disabled={busy !== null}
                className="border border-zinc-600 hover:border-orange-500 text-zinc-300 hover:text-orange-400 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {busy === 'test' ? 'Sending…' : 'Send test'}
              </button>
            </div>
          </div>
          <p className="text-zinc-500 text-xs">
            Sending is only possible from the preview screen, so you always see the email first. Use
            &ldquo;Send test&rdquo; to email a real copy to yourself before the full send.
          </p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {notice && <p className="text-green-400 text-sm">{notice}</p>}
        </div>
      )}
    </div>
  )
}
