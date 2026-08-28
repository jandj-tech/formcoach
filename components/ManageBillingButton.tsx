'use client'

import { useState } from 'react'

/**
 * Opens the Stripe billing portal for the signed-in organization.
 *
 * Self-contained on purpose: it needs no props, so it can be dropped into the
 * dashboard without threading subscription state through the whole tree.
 *
 * It hides itself when the API answers 409 `noBilling`. That is the normal
 * state for a grandfathered or comped organization — they were told they would
 * never be billed, and showing them a billing button that errors would be a
 * small broken promise. The cost is one click to find out, which only ever
 * happens once per page view.
 */
export default function ManageBillingButton() {
  const [loading, setLoading] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState('')

  if (hidden) return null

  async function open() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/org/billing-portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (res.status === 409 && data?.noBilling) {
        setHidden(true)
        return
      }
      if (!res.ok || !data?.url) {
        setError(data?.error || 'Could not open billing')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Could not open billing')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="text-sm font-semibold text-gray-600 hover:text-black underline underline-offset-2 disabled:opacity-50"
      >
        {loading ? 'Opening…' : 'Manage billing'}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
