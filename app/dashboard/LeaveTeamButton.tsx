'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LeaveTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function handleLeave() {
    if (!confirm(`Leave ${teamName}? You can rejoin later with the team code.`)) return
    setLeaving(true)
    try {
      const res = await fetch('/api/team/leave', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      if (!res.ok) throw new Error('Leave failed')
      router.refresh()
    } catch {
      setLeaving(false)
      alert('Could not leave the team. Please try again.')
    }
  }

  return (
    <button
      type="button"
      onClick={handleLeave}
      disabled={leaving}
      className="text-xs font-semibold text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors mt-2"
    >
      {leaving ? 'Leaving…' : 'Leave team'}
    </button>
  )
}
