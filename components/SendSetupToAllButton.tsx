'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MailIcon } from 'lucide-react'
import { backendButton } from '@/components/backend/button-styles'

interface SendAllResult {
  total: number
  sent: number
  skipped: { rateLimited: number; failed: number; alreadySetUp?: number }
}

// "Sent to 6. 1 skipped (already sent 3 times this hour)."
function summary(r: SendAllResult): string {
  const parts = [r.sent > 0 ? `Sent to ${r.sent}.` : 'None sent.']
  if (r.skipped.rateLimited > 0) {
    parts.push(`${r.skipped.rateLimited} skipped (already sent 3 times this hour).`)
  }
  if (r.skipped.alreadySetUp) {
    parts.push(`${r.skipped.alreadySetUp} already finished setting up.`)
  }
  if (r.skipped.failed > 0) {
    parts.push(`${r.skipped.failed} couldn’t be sent. Try again shortly.`)
  }
  return parts.join(' ')
}

// Team-level "email everyone who hasn't finished setup" for the org and coach
// rosters. `count` is what the roster shows; the server decides who actually
// gets one (and never returns the links).
export default function SendSetupToAllButton({
  endpoint,
  count,
  extra = {},
}: {
  endpoint: string
  count: number
  extra?: Record<string, unknown>
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)

  if (count === 0 && !result) return null

  async function send() {
    if (!confirm(`Send the setup email to ${count} player${count === 1 ? '' : 's'}?`)) return
    setSending(true); setResult(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extra),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult({ tone: 'error', text: data.error || 'Could not send the emails. Try again shortly.' })
        return
      }
      const r = data as SendAllResult
      const clean = r.skipped.rateLimited === 0 && r.skipped.failed === 0
      setResult({ tone: clean && r.sent > 0 ? 'ok' : 'warn', text: r.total === 0 ? 'Everyone has already finished setting up.' : summary(r) })
      router.refresh()
    } catch {
      setResult({ tone: 'error', text: 'Could not send the emails. Try again shortly.' })
    } finally {
      setSending(false)
    }
  }

  const toneCls =
    result?.tone === 'ok' ? 'text-green-700 dark:text-green-400'
      : result?.tone === 'warn' ? 'text-amber-700 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {count > 0 && (
        <button type="button" onClick={send} disabled={sending} className={backendButton('secondary', 'max-w-full')}>
          <MailIcon aria-hidden />
          {/* Wraps on a phone; the shared button style is nowrap. */}
          <span className="whitespace-normal text-left">
            {sending
              ? 'Sending…'
              : `Email setup link to ${count === 1 ? 'the 1 player' : `all ${count} players`} who haven’t finished`}
          </span>
        </button>
      )}
      {result && <p role="status" className={`text-xs font-semibold ${toneCls}`}>{result.text}</p>}
    </div>
  )
}
