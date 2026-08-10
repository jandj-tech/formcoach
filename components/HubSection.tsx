'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'

// Dark-theme accordion row for the /team hub. The body mounts on first open
// and STAYS mounted after (just hidden) so chat state, in-flight fetches, and
// form drafts survive open/close — while closed-by-default sections (chat)
// don't fetch anything until the user actually opens them.
export default function HubSection({
  icon,
  label,
  summary,
  defaultOpen = false,
  scrollOnOpen = false,
  children,
}: {
  icon: string
  label: string
  // Right-side hint while collapsed, e.g. "12 players", "Talk to your team".
  summary?: string
  defaultOpen?: boolean
  // Scroll the section to the top of the viewport when opened (big panels
  // like chat should own the screen once expanded).
  scrollOnOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [everOpened, setEverOpened] = useState(defaultOpen)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (open && scrollOnOpen) {
      sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [open, scrollOnOpen])

  return (
    <section ref={sectionRef} className="scroll-mt-4">
      <button
        type="button"
        onClick={() => {
          setOpen(o => !o)
          setEverOpened(true)
        }}
        aria-expanded={open}
        className="w-full bg-ink-900 border border-courtline rounded-2xl px-5 py-4 flex items-center justify-between gap-3 text-left hover:border-chalk-dim/40 transition-colors"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span aria-hidden className="text-lg leading-none select-none">{icon}</span>
          <span className="font-display font-bold uppercase text-chalk tracking-wide">{label}</span>
        </span>
        <span className="flex items-center gap-2 min-w-0 shrink-0">
          {summary && !open && <span className="text-chalk-dim text-xs truncate max-w-[10rem]">{summary}</span>}
          <ChevronDownIcon
            aria-hidden
            className={`w-5 h-5 text-chalk-dim shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {everOpened && (
        <div className={open ? 'bg-ink-900 border border-courtline rounded-2xl p-4 sm:p-5 mt-2' : 'hidden'}>
          {children}
        </div>
      )}
    </section>
  )
}
