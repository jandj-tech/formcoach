/**
 * How hard the cookie banner should interrupt on a given route.
 *
 * Since silence counts as "no", anyone who scrolls past the banner is permanently
 * invisible to Meta ads reporting. So this is not only a UX choice — it decides
 * how much attribution survives. Hard modal where an ad click lands and no task is
 * in progress; ignorable sheet anywhere someone is mid-task.
 */
export type ConsentSurface = 'modal' | 'sheet' | 'none'

/**
 * Top-of-funnel pages. Matched EXACTLY, never by prefix, so `/shop` gets the modal
 * while `/shop/success` (someone who just paid) does not, and `/team` gets it while
 * `/team/dashboard` does not. Add a route here to make it a hard stop.
 */
const MODAL_ROUTES = new Set([
  '/',
  '/mission',
  '/learn',
  '/shop',
  '/partners',
  '/team',
  '/org/pricing',
])

/** Internal staff only — the pixel is irrelevant there, so don't nag. */
const SUPPRESSED_PREFIXES = ['/admin']

export function consentSurfaceFor(pathname: string): ConsentSurface {
  // usePathname() omits the trailing slash except at the root, but normalise so a
  // stray '/shop/' can't silently downgrade to a sheet.
  const path =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname

  if (SUPPRESSED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return 'none'
  }
  return MODAL_ROUTES.has(path) ? 'modal' : 'sheet'
}
