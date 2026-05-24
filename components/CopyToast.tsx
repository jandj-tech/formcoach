'use client'

import { useEffect, useState } from 'react'

// Pill toast pinned to the top of the page. Listens for window 'copy-toast'
// events (dispatched by lib/copy.ts copyToClipboard) and shows the supplied
// message for ~2 seconds.
export default function CopyToast() {
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail
      setMsg(detail?.message ?? 'Copied!')
    }
    window.addEventListener('copy-toast', handler)
    return () => window.removeEventListener('copy-toast', handler)
  }, [])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2200)
    return () => clearTimeout(t)
  }, [msg])

  if (!msg) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-black text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg pointer-events-none"
      style={{ animation: 'copy-toast-in 200ms ease-out' }}
    >
      <style>{`
        @keyframes copy-toast-in {
          from { opacity: 0; transform: translate(-50%, -8px); }
          to   { opacity: 1; transform: translate(-50%, 0);    }
        }
      `}</style>
      ✓ {msg}
    </div>
  )
}
