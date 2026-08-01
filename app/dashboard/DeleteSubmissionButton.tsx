'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteSubmissionButton({ id }: { id: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this shot from your history? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/submissions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      router.refresh()
    } catch {
      setDeleting(false)
      alert('Could not delete that shot. Please try again.')
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      aria-label="Delete this shot"
      className="shrink-0 text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors px-3 py-2"
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  )
}
