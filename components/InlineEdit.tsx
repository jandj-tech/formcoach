'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  /** Current value. */
  value: string
  /** API route that saves the change (POST). */
  endpoint: string
  /** Request-body key the new value is sent under (e.g. 'name', 'ageGroup'). */
  bodyKey: string
  /** Extra fields merged into the request body (e.g. { teamId }). */
  extra?: Record<string, string>
  placeholder?: string
  /** Tailwind classes for the displayed value. */
  textClassName?: string
  /** Shown (muted) when the value is empty. */
  emptyLabel?: string
}

// Small inline "value + Edit" control: click Edit to reveal an input and save.
export default function InlineEdit({
  value,
  endpoint,
  bodyKey,
  extra = {},
  placeholder,
  textClassName = 'text-black font-semibold',
  emptyLabel = 'Not set',
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [bodyKey]: input.trim(), ...extra }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not save')
        setSaving(false)
        return
      }
      setEditing(false)
      setSaving(false)
      router.refresh()
    } catch {
      setError('Something went wrong')
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className={value ? textClassName : 'text-gray-400 italic'}>
          {value || emptyLabel}
        </span>
        <button
          type="button"
          onClick={() => { setInput(value); setError(''); setEditing(true) }}
          className="text-xs font-semibold text-orange-500 hover:text-orange-400 transition-colors"
        >
          Edit
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={placeholder}
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') { setEditing(false); setError('') }
        }}
        className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-base text-black focus:outline-none focus:border-orange-500"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="bg-orange-500 hover:bg-orange-400 disabled:bg-orange-300 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => { setEditing(false); setError('') }}
        className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
      >
        Cancel
      </button>
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </span>
  )
}
