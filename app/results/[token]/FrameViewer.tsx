'use client'

import { useEffect, useState } from 'react'

export default function FrameViewer({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState<number | null>(null)
  const open = index !== null

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIndex(null)
      if (e.key === 'ArrowLeft') setIndex((i) => (i !== null && i > 0 ? i - 1 : i))
      if (e.key === 'ArrowRight') setIndex((i) => (i !== null && i < urls.length - 1 ? i + 1 : i))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, urls.length])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (urls.length === 0) return null

  return (
    <div className="space-y-2">
      <h2 className="text-black font-bold text-sm">Analyzed Frames</h2>
      <p className="text-zinc-500 text-xs">Tap any frame to step through the shot in slow motion.</p>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {urls.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            className="relative cursor-pointer group focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-lg"
          >
            <img
              src={url}
              alt={`Frame ${i + 1}`}
              className="rounded-lg w-full aspect-video object-cover border border-gray-200 group-hover:border-orange-400 transition-colors"
            />
            <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-semibold rounded px-1.5">
              {i + 1}
            </span>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 text-white text-lg">🔍</span>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex flex-col"
          onClick={() => setIndex(null)}
        >
          <div
            className="flex items-center justify-between px-6 py-4 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-zinc-400 text-sm">
              Frame {index + 1} of {urls.length}
            </span>
            <button
              onClick={() => setIndex(null)}
              className="bg-white text-black font-bold text-sm px-5 py-2 rounded-full hover:bg-zinc-200"
            >
              ✕ Close
            </button>
          </div>

          <div
            className="flex-1 flex items-center justify-center px-6 min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={urls[index]}
              alt={`Frame ${index + 1}`}
              className="max-w-4xl w-full max-h-full object-contain rounded-xl border border-zinc-700"
            />
          </div>

          <div
            className="flex justify-center gap-3 px-6 py-5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              disabled={index === 0}
              onClick={() => setIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white px-6 py-2.5 rounded-lg text-sm font-bold"
            >
              ← Prev
            </button>
            <button
              disabled={index === urls.length - 1}
              onClick={() =>
                setIndex((i) => (i !== null && i < urls.length - 1 ? i + 1 : i))
              }
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-white px-6 py-2.5 rounded-lg text-sm font-bold"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
