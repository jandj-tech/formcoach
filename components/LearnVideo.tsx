'use client'

import { useState } from 'react'

export default function LearnVideo({ videoId, label }: { videoId: string; label?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-orange-500 hover:text-red-600 text-xs font-bold transition-colors inline-flex items-center gap-1.5"
      >
        {open ? 'Hide tutorial' : `${label ?? 'How to fix this'} ▾`}
      </button>

      {open && (
        <div className="mt-2 aspect-video bg-black rounded-lg overflow-hidden">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title="Tutorial"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  )
}
