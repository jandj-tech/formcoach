'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, so the forms
 * behave exactly as before until the keys are configured — the server side
 * (lib/turnstile.ts) is unconfigured in that same window and skips the check.
 *
 * Most visitors never interact with it: Turnstile resolves silently and only
 * shows a checkbox when the request looks suspect.
 */

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('turnstile script failed')))
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile script failed'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

export const TURNSTILE_ENABLED = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export interface TurnstileHandle {
  /** Clears the spent token and re-challenges, for use after a failed submit. */
  reset: () => void
}

export default function Turnstile({
  onToken,
  theme = 'auto',
  className = '',
}: {
  onToken: (token: string) => void
  theme?: 'light' | 'dark' | 'auto'
  className?: string
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)

  // The callback changes identity on every parent render; holding it in a ref
  // keeps the widget from being torn down and re-rendered each time.
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        if (widgetIdRef.current) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => onTokenRef.current(token),
          // A token is single-use and expires; refresh it so a visitor who
          // fills a long form slowly is not rejected on submit.
          'refresh-expired': 'auto',
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => {
            onTokenRef.current('')
            setFailed(true)
          },
        })
      })
      .catch(() => setFailed(true))

    return () => {
      cancelled = true
      const id = widgetIdRef.current
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id)
        } catch {
          // Widget already gone with the unmounted DOM node.
        }
      }
      widgetIdRef.current = null
    }
  }, [siteKey, theme])

  if (!siteKey) return null

  return (
    <div className={className}>
      <div ref={containerRef} />
      {failed && (
        <p className="text-xs text-red-400 mt-1">
          Couldn&apos;t load the human check. Disable your ad blocker or try another browser.
        </p>
      )}
    </div>
  )
}
