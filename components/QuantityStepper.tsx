'use client'

import { useEffect, useState } from 'react'
import { MinusIcon, PlusIcon } from 'lucide-react'

type Props = {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  ariaLabel?: string
  size?: 'sm' | 'md'
}

export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  ariaLabel = 'Quantity',
  size = 'md',
}: Props) {
  // The field is free text while being edited so a partial entry ("1" on the
  // way to "150") is not clamped out from under the person typing it. The
  // committed value is only ever a clamped number.
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  const dec = () => onChange(clamp(value - 1))
  const inc = () => onChange(clamp(value + 1))

  function handleType(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '')
    setDraft(digits)
    const n = parseInt(digits, 10)
    // Only push upward while the typed number is already in range; anything
    // out of range waits for blur so backspacing to retype does not snap.
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n)
  }

  function commit() {
    const n = parseInt(draft, 10)
    const next = Number.isFinite(n) ? clamp(n) : value
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  const btn = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  const text = size === 'sm' ? 'text-sm' : 'text-base'
  // Wide enough for the largest allowed quantity without reflowing the pill.
  const field = `${String(max).length + 1}ch`

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center bg-zinc-900 border border-zinc-800 rounded-full p-1"
    >
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={`inline-flex items-center justify-center ${btn} rounded-full text-white hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors`}
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(e) => handleType(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            e.currentTarget.blur()
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={ariaLabel}
        style={{ width: field }}
        className={`bg-transparent px-1 text-center text-white font-bold outline-none focus:ring-2 focus:ring-ember-500/60 rounded ${text}`}
      />
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={`inline-flex items-center justify-center ${btn} rounded-full text-white hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors`}
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  )
}
