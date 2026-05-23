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
      className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors underline underline-offset-2"
    >
      {deleting ? 'Deleting account…' : 'Delete account'}
    </button>
  )
}
