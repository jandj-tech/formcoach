'use client'

import { useEffect, useId, useRef, useState } from 'react'

// Small (i) icon that reveals a short explanation. Works for mouse (hover),
// keyboard (focus / Escape), and touch (tap toggles, tap outside closes) —
// players are mostly on phones, so hover alone isn't enough.
export default function InfoTip({
  label,
  children,
  align = 'center',
}: {
  // Accessible name for the icon, e.g. "What are shot tokens?"
  label: string
  children: React.ReactNode
  // Panel alignment relative to the icon, for tips near a screen edge.
  align?: 'left' | 'center' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const alignClass =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onPointerEnter={e => { if (e.pointerType === 'mouse') setOpen(true) }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setOpen(false) }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-gray-400 text-[10px] font-bold leading-none select-none hover:border-orange-500 hover:text-orange-500 focus:outline-none focus-visible:border-orange-500 focus-visible:text-orange-500 transition-colors cursor-help"
      >
        i
      </button>
      {open && (
        <span
          id={panelId}
          role="tooltip"
          className={`absolute top-full ${alignClass} z-30 mt-2 w-60 max-w-[80vw] rounded-xl bg-gray-900 px-3 py-2.5 text-xs font-normal normal-case tracking-normal leading-relaxed text-white shadow-xl shadow-black/20`}
        >
          {children}
        </span>
      )}
    </span>
  )
}
