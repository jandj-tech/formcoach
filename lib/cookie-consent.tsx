'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { UI_AUTH_HINT_COOKIE } from '@/lib/sessions'

/**
 * Cookie consent. Two categories, because two is what we actually set:
 *
 *   essential  — session cookies (fc_session, fc_team_session, fc_org_session,
 *                admin_auth, fc_oauth_state, fc_org_pending) plus the cart and
 *                theme entries in localStorage. No consent needed and no toggle:
 *                without them you cannot stay logged in or keep a cart.
 *   marketing  — the Meta Pixel (_fbp / _fbc). Off until someone says yes.
 *
 * There is deliberately no "analytics" category. We run no analytics product,
 * and listing a category we don't use would make the banner a false statement.
 * If GA/Plausible/PostHog ever lands, add the category HERE and gate the script
 * the same way `MetaPixel` is gated — a banner that under-declares is the one
 * failure mode that actually matters.
 */

const STORAGE_KEY = 'lh_cookie_consent'
/** Bump to re-ask everyone — do it whenever a new category is introduced. */
const VERSION = 1

export type CookiePrefs = {
  /** Always true. Present so callers can read one shape for every category. */
  essential: true
  marketing: boolean
}

type StoredConsent = {
  v: number
  marketing: boolean
  /** ISO timestamp of the decision — this is the record that consent happened. */
  ts: string
}

export const DENY_ALL: CookiePrefs = { essential: true, marketing: false }
export const ALLOW_ALL: CookiePrefs = { essential: true, marketing: true }

type ConsentContext = {
  /**
   * null until the browser has been read. Nothing non-essential may load while
   * this is null — on the server and on the first paint we do not yet know.
   */
  prefs: CookiePrefs | null
  /** True once a real choice is stored for the current VERSION. */
  hasDecided: boolean
  /** True when the banner or the settings panel should be on screen. */
  isOpen: boolean
  /**
   * Whether a session looks to be in progress, from the proxy-maintained
   * `fc_ui_auth` hint. Used ONLY to soften the banner for someone already
   * signed in — never as an access check. See UI_AUTH_HINT_COOKIE.
   */
  isSignedIn: boolean
  save: (prefs: CookiePrefs) => void
  openSettings: () => void
  closeSettings: () => void
}

const Ctx = createContext<ConsentContext | null>(null)

function readStored(): CookiePrefs | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConsent
    // A stored decision from an older category set is not a decision about the
    // current one, so it is treated as no decision at all and we re-ask.
    if (parsed?.v !== VERSION) return null
    return { essential: true, marketing: parsed.marketing === true }
  } catch {
    // Private mode, disabled storage, or corrupt JSON. Deny by default.
    return null
  }
}

/**
 * Best-effort removal of the Meta Pixel's cookies when consent is withdrawn.
 * They are first-party (set by fbevents.js on our own domain), so we can expire
 * them. The apex variant is covered too because the pixel sets on `.domain`.
 */
function clearMarketingCookies() {
  const host = window.location.hostname
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`]
  for (const name of ['_fbp', '_fbc']) {
    for (const domain of domains) {
      document.cookie =
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` +
        (domain ? `; domain=${domain}` : '')
    }
  }
}

/** Reads the proxy-maintained hint. Presence only — never trusted for access. */
function readSignedInHint(): boolean {
  return document.cookie
    .split('; ')
    .some((c) => c === `${UI_AUTH_HINT_COOKIE}=1`)
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<CookiePrefs | null>(null)
  const [hasDecided, setHasDecided] = useState(false)
  const [manuallyOpened, setManuallyOpened] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  // Gates the banner on having mounted: the server cannot know what is in
  // localStorage, so rendering it during SSR would be a hydration mismatch.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Deferred to post-hydration so the server render (no consent, nothing
    // loaded) matches the first client render, then populate. Same standard
    // localStorage hydration pattern as CartProvider; rule disabled
    // deliberately.
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = readStored()
    if (stored) {
      setPrefs(stored)
      setHasDecided(true)
    }
    setIsSignedIn(readSignedInHint())
    setMounted(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const save = useCallback((next: CookiePrefs) => {
    const withdrawingMarketing = !next.marketing
    try {
      const record: StoredConsent = {
        v: VERSION,
        marketing: next.marketing,
        ts: new Date().toISOString(),
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      // Storage unavailable — honour the choice for this page view anyway.
    }
    setPrefs(next)
    setHasDecided(true)
    setManuallyOpened(false)

    if (withdrawingMarketing) {
      clearMarketingCookies()
      // fbq has already loaded and lives in memory; unmounting the <Script> does
      // not unload it. A reload is the only reliable way to stop it firing.
      if (window.fbq) window.location.reload()
    }
  }, [])

  const value = useMemo<ConsentContext>(
    () => ({
      prefs,
      hasDecided,
      isOpen: mounted && (!hasDecided || manuallyOpened),
      isSignedIn,
      save,
      openSettings: () => setManuallyOpened(true),
      closeSettings: () => setManuallyOpened(false),
    }),
    [prefs, hasDecided, manuallyOpened, mounted, isSignedIn, save],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCookieConsent(): ConsentContext {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error('useCookieConsent must be used inside <CookieConsentProvider>')
  }
  return ctx
}
