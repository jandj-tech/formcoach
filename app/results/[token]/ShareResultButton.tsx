'use client'

import { useEffect, useState } from 'react'
import { copyToClipboard } from '@/lib/copy'

// Share popup: copyable link, downloadable score card image (the same one
// used for link previews), and the native share sheet where available.
export default function ShareResultButton({ score }: { score: number | null }) {
  const [open, setOpen] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const [url, setUrl] = useState('')
  const [imgSrc, setImgSrc] = useState('')

  useEffect(() => {
    // Path only — query strings here are viewer state (?as=player,
    // ?token_purchased) and must never ride along in a shared link.
    setUrl(`${window.location.origin}${window.location.pathname}`)
    setImgSrc(`${window.location.pathname.replace(/\/$/, '')}/opengraph-image`)
    setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const hasScore = score !== null && !Number.isNaN(score)
  const shareText = hasScore
    ? `I scored ${score!.toFixed(1)}/10 on LearnHoops AI shot analysis 🏀`
    : 'My jump shot, graded by AI on LearnHoops 🏀'

  async function nativeShare() {
    try {
      await navigator.share({ title: 'My LearnHoops shot score', text: shareText, url })
    } catch {
      // User closed the share sheet — nothing to do.
    }
  }

  async function downloadImage() {
    try {
      const res = await fetch(imgSrc)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'learnhoops-score.png'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      // Image fetch failed — the preview above still shows it, so the user
      // can long-press / right-click to save.
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-gray-300 hover:border-orange-500 hover:text-orange-600 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center px-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share your results"
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-black">Share your results</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-black text-2xl leading-none px-1 transition-colors"
              >
                ×
              </button>
            </div>

            {/* Score card image — same one shown in link previews */}
            {imgSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt="Your LearnHoops score card"
                className="w-full rounded-xl border border-gray-200"
              />
            )}

            {/* Copyable link */}
            <div className="flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2.5 text-xs text-gray-600 bg-gray-50 focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={() => copyToClipboard(url)}
                className="shrink-0 bg-black hover:bg-zinc-800 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
              >
                Copy link
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {canNativeShare && (
                <button
                  onClick={nativeShare}
                  className="flex-1 bg-orange-500 hover:bg-red-600 text-ink-950 font-bold py-2.5 rounded-xl text-sm transition-colors"
                >
                  Share…
                </button>
              )}
              <button
                onClick={downloadImage}
                className="flex-1 border border-gray-300 hover:border-orange-500 hover:text-orange-600 text-black font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                Download image
              </button>
            </div>

            <p className="text-[11px] text-gray-400 text-center">
              The link and image show your score only — no name attached.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
