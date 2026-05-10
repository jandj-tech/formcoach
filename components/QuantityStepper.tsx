'use client'

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
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))

  const btn =
    size === 'sm'
      ? 'h-8 w-8'
      : 'h-10 w-10'
  const text =
    size === 'sm'
      ? 'text-sm min-w-[2ch]'
      : 'text-base min-w-[2ch]'

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
      <span
        aria-live="polite"
        className={`px-3 text-center text-white font-bold ${text}`}
      >
        {value}
      </span>
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
