'use client'

import { useState } from 'react'

export default function ResetOrgPasswordButton({
  orgId,
  orgName,
}: {
  orgId: string
  orgName: string
}) {
  const [status, setStatus] = useState<'idle' | 'saving'>('idle')

  async function reset() {
    const pw = window.prompt(`Set a new password for "${orgName}" (6+ characters):`)
    if (pw === null) return
    if (pw.length < 6) {
      alert('Password must be at least 6 characters.')
      return
    }
    setStatus('saving')
    try {
      const res = await fetch('/api/admin/reset-org-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, password: pw }),
      })
      if (!res.ok) throw new Error('Failed')
      alert(`Password updated for ${orgName}. Share the new password with them.`)
    } catch {
      alert('Could not reset the password. Please try again.')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <button
      onClick={reset}
      disabled={status === 'saving'}
      className="text-xs font-semibold text-orange-500 hover:text-orange-400 disabled:opacity-50 transition-colors"
    >
      {status === 'saving' ? 'Saving…' : 'Reset password'}
    </button>
  )
}
