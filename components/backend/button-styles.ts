/**
 * One button scale for the coach / org dashboards.
 *
 * Exported as a class string rather than a component because these dashboards
 * need the same button as a <Link>, a <button>, and a form submit, and a
 * wrapper for each of those is three components that can drift apart.
 *
 * Hierarchy matters more than colour here. The old dashboards gave Log out
 * the solid-orange primary treatment — the rarest and least useful action on
 * the page was the loudest thing on it — while real actions were plain links.
 *
 *   primary   the one thing this page wants you to do
 *   secondary a real action, but not the point of the page
 *   quiet     navigation and exits (Log out, Manage billing, Hub)
 *   danger    destructive, and only ever behind a confirm
 *
 * Colours stay on the ember/ink/chalk scale from globals.css — note that only
 * ember 400–700 exist, so lighter tints are opacity of ember-500 rather than
 * an ember-50 that would silently render as no class at all.
 */
const base =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold ' +
  'whitespace-nowrap transition-colors disabled:opacity-60 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-400 ' +
  "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:w-4 [&_svg:not([class*='size-'])]:h-4"

const variants = {
  primary: 'bg-ember-500 hover:bg-ember-600 text-ink-950 border border-transparent',
  secondary:
    'border border-ember-500/40 text-ember-600 dark:text-ember-400 hover:bg-ember-500/10',
  quiet:
    'border border-gray-200 dark:border-courtline text-gray-600 dark:text-chalk-dim ' +
    'hover:text-black dark:hover:text-chalk hover:border-gray-300 dark:hover:border-chalk-dim/40',
  danger:
    'border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 ' +
    'hover:bg-red-50 dark:hover:bg-red-950/40',
} as const

export type BackendButtonVariant = keyof typeof variants

export function backendButton(
  variant: BackendButtonVariant = 'secondary',
  extra = '',
): string {
  return `${base} ${variants[variant]} ${extra}`.trim()
}
