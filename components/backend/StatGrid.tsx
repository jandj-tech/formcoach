import type { ReactNode } from 'react'

/**
 * The row of headline numbers at the top of a dashboard.
 *
 * Previously these lived as bare columns inside one tinted band, which put
 * "team code", "credits" and "credit price" at identical weight and let them
 * reflow into a ragged block on narrow screens. Cards in a grid give each
 * number its own edges, keep the columns honest at every width, and leave
 * room for the one-line explanation each of them needs.
 */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    // auto-fit rather than a fixed column count: the coach dashboard shows
    // five of these on the web and four inside the app (no credit price), and
    // a fixed grid orphaned the last card onto a row of its own in whichever
    // case it wasn't tuned for.
    <section className="grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
      {children}
    </section>
  )
}

export function StatCard({
  label,
  value,
  /** The InfoTip that explains this number. */
  hint,
  /** Small line under the value, e.g. "team rate active". */
  note,
  /** Codes and balances read better tabular; prose values do not. */
  mono = false,
  /** One card per grid may carry the ember tint — the page's key number. */
  accent = false,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  note?: ReactNode
  mono?: boolean
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 ${
        accent
          ? 'border-ember-500/40 bg-ember-500/10'
          : 'border-gray-200 dark:border-courtline bg-white dark:bg-ink-900'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <h2 className="text-[11px] font-bold text-gray-500 dark:text-chalk-dim uppercase tracking-wide">
          {label}
        </h2>
        {hint}
      </div>
      <p
        className={`text-2xl font-black text-black dark:text-chalk mt-1 truncate ${
          mono ? 'font-mono tracking-widest' : ''
        }`}
      >
        {value}
      </p>
      {note && <div className="text-[11px] font-semibold leading-tight mt-0.5">{note}</div>}
    </div>
  )
}
