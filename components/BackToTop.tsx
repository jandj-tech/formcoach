'use client'

import { useEffect, useState } from 'react'

/** How far down the page you must be before the button is worth offering. */
const SHOW_AFTER_SCREENS = 1.5

/**
 * Floating "back to top" control.
 *
 * Mounted ONCE in the root layout rather than added page by page. It shows
 * itself only once you are more than ~1.5 screens down, so a page too short to
 * need it never renders a button at all. That keeps "which pages require this"
 * answered by the content itself instead of by a hand-kept list that goes stale
 * the moment a page grows or shrinks.
 *
 * Ember on ink is deliberate: this floats over both the dark marketing pages
 * and the white account pages, and the brand CTA colour is the one pairing that
 * stays legible on either ground.
 */
export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // rAF-throttled so a fast scroll cannot queue a setState per scroll event.
    let frame = 0

    function onScroll() {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setIsVisible(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS)
      })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  function handleClick() {
    // Honour the OS setting rather than the CSS one: this scroll is started
    // from script, so a `prefers-reduced-motion` media rule would not catch it.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }

  if (!isVisible) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Back to top"
      // bottom uses max() so the button clears the iPhone home indicator — the
      // root layout sets viewport-fit=cover, so it would otherwise sit under it.
      className="fixed right-5 sm:right-6 z-50 h-11 w-11 rounded-full bg-ember-500 text-ink-950
                 shadow-lg shadow-black/25 ring-1 ring-black/10 flex items-center justify-center
                 hover:bg-ember-400 transition-colors
                 animate-in fade-in duration-200 motion-reduce:animate-none
                 bottom-[max(1.25rem,env(safe-area-inset-bottom))]"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  )
}
