'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RemoveEmailButton({ email }: { email: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function remove() {
    if (!confirm(`Remove ${email} from the email list?`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/emails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed')
      router.refresh()
    } catch {
      setLoading(false)
      alert('Could not remove that email. Please try again.')
    }
  }

  return (
    <button
      onClick={remove}
      disabled={loading}
      className="text-xs font-semibold text-zinc-500 hover:text-red-400 disabled:opacity-50 transition-colors"
    >
      {loading ? '…' : 'Remove'}
    </button>
  )
}
