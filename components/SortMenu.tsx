'use client'

import { useEffect, useRef, useState } from 'react'

export interface SortOption<T extends string> {
  value: T
  label: string
}

// Reusable "Sort by:" dropdown. Closes on outside click; hidden when printing.
export default function SortMenu<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: SortOption<T>[]
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const currentLabel = options.find((o) => o.value === value)?.label ?? ''

  return (
    <div className="relative print:hidden" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-black border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
      >
        Sort by: <span className="text-black">{currentLabel}</span>
        <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-orange-50 ${
                opt.value === value ? 'font-bold text-orange-600' : 'text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
