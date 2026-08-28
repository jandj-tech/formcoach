/**
 * "Continue with Google / Apple" — the same pair of buttons on login and
 * signup, because to a provider the two are one action: there is no separate
 * "register", and asking someone to pick the right page before they can tap is
 * exactly the friction this is meant to remove.
 *
 * These are plain links, not fetches: the flow is a full-page redirect to the
 * provider and back, so there is no state worth holding on this side.
 */

interface Props {
  /** Where a player lands afterwards. Coaches and organizations go to their dashboard regardless. */
  next?: string
  /** Free analyses from a ball order, waiting to be attached to whichever account signs in. */
  claimToken?: string
  /** A coach's invite link. */
  teamInvite?: string
  /** Team code typed on the signup form. */
  teamCode?: string
  className?: string
}

export default function OAuthButtons({ next, claimToken, teamInvite, teamCode, className = '' }: Props) {
  // These ride through the provider inside the signed state — see
  // app/api/auth/oauth/[provider]/start/route.ts.
  const params = new URLSearchParams()
  if (next) params.set('next', next)
  if (claimToken) params.set('claimToken', claimToken)
  if (teamInvite) params.set('teamInvite', teamInvite)
  if (teamCode) params.set('teamCode', teamCode)
  const q = params.size ? `?${params}` : ''

  return (
    <div className={`space-y-3 ${className}`}>
      <a
        href={`/api/auth/oauth/google/start${q}`}
        className="flex items-center justify-center gap-3 w-full bg-white hover:bg-zinc-100 text-[#1f1f1f] font-semibold py-3.5 rounded-full transition-colors active:scale-[0.99]"
      >
        <GoogleMark />
        Continue with Google
      </a>

      <a
        href={`/api/auth/oauth/apple/start${q}`}
        className="flex items-center justify-center gap-2.5 w-full bg-white hover:bg-zinc-100 text-black font-semibold py-3.5 rounded-full transition-colors active:scale-[0.99]"
      >
        <AppleMark />
        Continue with Apple
      </a>

      <div className="flex items-center gap-3 pt-1" aria-hidden>
        <span className="h-px flex-1 bg-courtline" />
        <span className="text-xs uppercase tracking-wide text-chalk-dim">or</span>
        <span className="h-px flex-1 bg-courtline" />
      </div>
    </div>
  )
}

/** Google's four-colour G. Its colours are fixed by their branding rules. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg width="16" height="19" viewBox="0 0 16 19" aria-hidden focusable="false" fill="currentColor">
      <path d="M13.17 10.06c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.18-.02 1.93-1.08 2.65-2.14.83-1.22 1.18-2.41 1.2-2.47-.03-.01-2.3-.88-2.32-3.52ZM11 3.66c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.7-.92 2.7.97.08 1.96-.5 2.58-1.23Z" />
    </svg>
  )
}
