'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteAccountButton() {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Permanently delete your account and all shot history? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/auth/delete-account', { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      router.push('/')
    } catch {
      setDeleting(false)
      alert('Could not delete your account. Please try again.')
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="shrink-0 text-xs font-semibold text-red-600 border border-red-300 hover:bg-red-50 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors"
    >
      {deleting ? 'Deleting account…' : 'Delete account'}
    </button>
  )
}
