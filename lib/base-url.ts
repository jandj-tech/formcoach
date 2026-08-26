/**
 * The public origin used to build links that leave the server — email links,
 * payment redirects, anything a user clicks from outside the app.
 *
 * This exists because getting it wrong is silent. Every one of these links is
 * generated server-side and mailed or redirected away, so a bad origin isn't
 * visible in the app itself: it surfaces later as "the link doesn't work".
 * Two real regressions came from that:
 *
 *  - The old fallback chain ended at `http://localhost:3000` once VERCEL_URL
 *    stopped existing off Vercel, which bakes dead links into every email.
 *  - After the cPanel cutover the box still had the `vercel env pull` value
 *    `https://formcoach-psi.vercel.app`, so approval links, password resets and
 *    results links all pointed at the retired deployment.
 *
 * So the rules here are deliberately fail-safe: an unusable value falls back to
 * the live site, never to localhost, and localhost is only ever used when the
 * runtime says outright that this is a dev or test process.
 */

/** Canonical public origin. Update here if the domain ever changes. */
export const CANONICAL_ORIGIN = 'https://www.learnhoops.com'

/** Hosts that must never be used to build an outbound link in production. */
function isStaleOrigin(origin: string): boolean {
  return (
    // Retired Vercel deployments — learnhoops.com has been off Vercel since
    // 2026-08-25 and Vercel is kept only as a DNS-level rollback.
    origin.endsWith('.vercel.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1')
  )
}

export function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '')

  if (configured && !isStaleOrigin(configured)) return configured

  // Only a runtime that positively identifies itself as dev/test gets
  // localhost. Anything else — production, or an env that simply forgot to set
  // NODE_ENV — gets the live site rather than a link that can't resolve.
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return configured || 'http://localhost:3000'
  }

  return CANONICAL_ORIGIN
}
