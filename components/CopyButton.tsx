'use client'

import { useState } from 'react'

/**
 * Copies a short value — an email, a token — to the clipboard.
 *
 * Selecting the text by hand should always work too; this is a shortcut, not
 * a substitute. Where one of these appears next to a value, check that the
 * value itself is still selectable.
 */
export default function CopyButton({
  value,
  label = 'Copy',
  className = '',
}: {
  value: string
  label?: string
  className?: string
}) {
  const [done, setDone] = useState(false)

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      title={value}
      className={`text-[11px] font-bold px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-orange-400 hover:border-orange-400 transition-colors ${className}`}
    >
      {done ? 'Copied' : label}
    </button>
  )
}
