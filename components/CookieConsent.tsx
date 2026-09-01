'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ALLOW_ALL, DENY_ALL, useCookieConsent } from '@/lib/cookie-consent'
import { consentSurfaceFor, type ConsentSurface } from '@/lib/consent-surface'

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Decides whether to show the consent UI and how hard it should interrupt, then
 * mounts the panel. The panel is a separate component mounted only while open, so
 * its form state initialises from props on mount — no effect syncing state, which
 * is what `react-hooks/set-state-in-effect` guards against.
 */
export default function CookieConsent() {
  const { isOpen, hasDecided, prefs, save, closeSettings } = useCookieConsent()
  const pathname = usePathname()

  if (!isOpen) return null

  // The iOS app WebView runs no advertising tools, so there is nothing to consent
  // to and the banner would just be in the way.
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('LearnHoopsApp')) {
    return null
  }

  // Reopening from the footer is always the soft sheet, whatever page they are on —
  // someone who came to change a setting should never be walled in. Only the
  // first-visit banner escalates by route.
  const surface: ConsentSurface = hasDecided ? 'sheet' : consentSurfaceFor(pathname)
  if (surface === 'none') return null

  return (
    <ConsentPanel
      surface={surface}
      // Reopened from the footer: land straight on the checkboxes, since they came
      // to change something specific rather than to make a first choice.
      initialCustomizing={hasDecided}
      initialMarketing={prefs?.marketing ?? false}
      dismissable={hasDecided}
      onSave={save}
      onDismiss={closeSettings}
    />
  )
}

function ConsentPanel({
  surface,
  initialCustomizing,
  initialMarketing,
  dismissable,
  onSave,
  onDismiss,
}: {
  surface: Exclude<ConsentSurface, 'none'>
  initialCustomizing: boolean
  initialMarketing: boolean
  /** False on a first visit: there is no prior choice to fall back to. */
  dismissable: boolean
  onSave: (prefs: { essential: true; marketing: boolean }) => void
  onDismiss: () => void
}) {
  const [customizing, setCustomizing] = useState(initialCustomizing)
  const [marketing, setMarketing] = useState(initialMarketing)
  const panelRef = useRef<HTMLDivElement>(null)
  const isModal = surface === 'modal'

  // Move focus into the dialog so keyboard and screen reader users land on it.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // The modal locks the page behind it; the sheet deliberately does not.
  useEffect(() => {
    if (!isModal) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isModal])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        onDismiss()
        return
      }
      // Trap Tab inside the modal so focus cannot wander onto the locked page.
      if (e.key !== 'Tab' || !isModal || !panelRef.current) return
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isModal, dismissable, onDismiss])

  const btn =
    'flex-1 rounded-xl px-5 py-3 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900'

  const shell = isModal
    ? `fixed z-[91] inset-x-4 top-1/2 -translate-y-1/2 mx-auto w-auto sm:max-w-lg
       max-h-[90dvh] overflow-y-auto overscroll-contain
       rounded-3xl border border-courtline bg-ink-900 text-chalk
       shadow-2xl shadow-black/60 focus:outline-none
       animate-in zoom-in-95 fade-in duration-300`
    : `fixed z-[91] inset-x-0 bottom-0 sm:inset-x-4 sm:bottom-4 mx-auto w-full sm:max-w-2xl
       max-h-[85dvh] overflow-y-auto overscroll-contain
       rounded-t-3xl sm:rounded-3xl border border-courtline bg-ink-900 text-chalk
       shadow-2xl shadow-black/60 focus:outline-none
       animate-in slide-in-from-bottom-6 fade-in duration-300`

  return (
    <>
      <div
        aria-hidden
        className={`fixed inset-0 z-[90] animate-in fade-in duration-300 ${
          isModal ? 'bg-black/70 backdrop-blur-sm' : 'bg-black/50 backdrop-blur-[2px]'
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={isModal}
        aria-labelledby="cookie-consent-title"
        aria-describedby="cookie-consent-body"
        tabIndex={-1}
        className={shell}
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        <div className="p-6 sm:p-7">
          <p className="eyebrow text-ember-400 mb-2 select-none">Your privacy</p>
          <h2
            id="cookie-consent-title"
            className="font-display font-black uppercase text-xl sm:text-2xl leading-tight mb-2.5"
          >
            We use cookies
          </h2>
          <p id="cookie-consent-body" className="text-sm text-chalk-dim leading-relaxed">
            Some are required to keep you signed in and hold your cart — those stay on
            either way. We&apos;d also like to use advertising cookies to measure how
            well our ads work, and those stay off until you say yes. You can change
            your mind any time from{' '}
            <span className="text-chalk">Cookie settings</span> in the footer. Read our{' '}
            <Link href="/privacy" className="text-ember-400 underline hover:text-ember-300">
              privacy policy
            </Link>
            .
          </p>

          {customizing && (
            <div className="mt-5 space-y-3">
              <CategoryRow
                title="Strictly necessary"
                required
                checked
                description="Keeps you signed in, remembers your cart and your light/dark choice, and protects sign-in from tampering."
                detail="fc_session · fc_team_session · fc_org_session · admin_auth · fc_oauth_state · fc_org_pending — up to 30 days"
              />
              <CategoryRow
                title="Advertising"
                checked={marketing}
                onChange={setMarketing}
                description="Lets the Meta Pixel tell us which ads led to a signup or a purchase. Shares pages visited and, on signup, a hashed email with Meta."
                detail="_fbp · _fbc — up to 90 days · set by Meta Platforms"
              />
            </div>
          )}

          {/* Accept and Reject are deliberately the same size and weight — a
              dressed-up accept beside a muted reject is the dark pattern
              regulators actually cite. */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={() => onSave(DENY_ALL)}
              className={`${btn} border border-courtline bg-ink-800 text-chalk hover:bg-ink-700`}
            >
              Reject all
            </button>
            {customizing ? (
              <button
                type="button"
                onClick={() => onSave({ essential: true, marketing })}
                className={`${btn} border border-courtline bg-ink-800 text-chalk hover:bg-ink-700`}
              >
                Save my choices
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCustomizing(true)}
                className={`${btn} border border-courtline bg-ink-800 text-chalk hover:bg-ink-700`}
              >
                Customize
              </button>
            )}
            <button
              type="button"
              onClick={() => onSave(ALLOW_ALL)}
              className={`${btn} bg-ember-500 text-ink-950 hover:bg-ember-400`}
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function CategoryRow({
  title,
  description,
  detail,
  checked,
  onChange,
  required = false,
}: {
  title: string
  description: string
  detail: string
  checked: boolean
  onChange?: (next: boolean) => void
  required?: boolean
}) {
  return (
    <label
      className={`flex gap-3.5 rounded-2xl border border-courtline bg-ink-800 p-4 ${
        required
          ? 'opacity-80'
          : 'cursor-pointer hover:border-ember-500/50 transition-colors'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={required}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-ember-500 disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-chalk">{title}</span>
          {required && (
            <span className="eyebrow text-[0.6rem] text-chalk-dim">Always on</span>
          )}
        </span>
        <span className="mt-1 block text-xs text-chalk-dim leading-relaxed">
          {description}
        </span>
        <span className="mt-1.5 block font-mono text-[0.65rem] text-chalk-dim/70 break-words">
          {detail}
        </span>
      </span>
    </label>
  )
}
